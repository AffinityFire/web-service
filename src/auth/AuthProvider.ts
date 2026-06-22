import * as msal from "@azure/msal-node";
import { msalConfig } from "../authConfig.ts";
import type { Context } from "@oak/oak";
import type { AppState } from "../mod.ts";

interface Options {
  successRedirect?: string;
  scopes?: string[];
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  // OIDC prompt behaviour, e.g. "select_account" to force the account picker.
  prompt?: string;
}

interface AuthCodeUrlRequestParams {
  state: string;
  scopes: string[];
  redirectUri: string;
  prompt?: string;
}

interface AuthCodeRequestParams {
  state: string;
  scopes: string[];
  redirectUri: string;
}

class AuthProvider {
  private msalConfig: msal.Configuration;
  private cryptoProvider: msal.CryptoProvider;

  constructor(msalConfig: msal.Configuration) {
    this.msalConfig = msalConfig;
    this.cryptoProvider = new msal.CryptoProvider();
  }

  login(options: Options = {}) {
    return async (
      ctx: Context<AppState>,
      next?: () => Promise<unknown>,
    ) => {
      /**
       * MSAL Node library allows you to pass your custom state as state parameter in the Request object.
       * The state parameter can also be used to encode information of the app's state before redirect.
       * You can pass the user's state in the app, such as the page or view they were on, as input to this parameter.
       */
      const state = this.cryptoProvider.base64Encode(
        JSON.stringify({
          successRedirect: options.successRedirect || "/",
        }),
      );

      const authCodeUrlRequestParams: AuthCodeUrlRequestParams = {
        state: state,

        /**
         * By default, MSAL Node will add OIDC scopes to the auth code url request. For more information, visit:
         * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
         */
        scopes: options.scopes || [],
        redirectUri: options.redirectUri ?? "/",
        // Forwarded to the authorization URL, e.g. "select_account".
        prompt: options.prompt,
      };

      const authCodeRequestParams: AuthCodeRequestParams = {
        state: state,

        /**
         * By default, MSAL Node will add OIDC scopes to the auth code request. For more information, visit:
         * https://docs.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent#openid-connect-scopes
         */
        scopes: options.scopes || [],
        redirectUri: options.redirectUri ?? "/",
      };

      /**
       * If the current msal configuration does not have cloudDiscoveryMetadata or authorityMetadata, we will
       * make a request to the relevant endpoints to retrieve the metadata. This allows MSAL to avoid making
       * metadata discovery calls, thereby improving performance of token acquisition process. For more, see:
       * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/performance.md
       */
      if (
        !this.msalConfig.auth.cloudDiscoveryMetadata ||
        !this.msalConfig.auth.authorityMetadata
      ) {
        if (!this.msalConfig.auth.authority) {
          throw new Error("no authority");
        }
        const [cloudDiscoveryMetadata, authorityMetadata] = await Promise.all([
          this.getCloudDiscoveryMetadata(
            this.msalConfig.auth.authority,
          ),
          this.getAuthorityMetadata(
            this.msalConfig.auth.authority,
          ),
        ]);

        this.msalConfig.auth.cloudDiscoveryMetadata = JSON.stringify(
          cloudDiscoveryMetadata,
        );
        this.msalConfig.auth.authorityMetadata = JSON.stringify(
          authorityMetadata,
        );
      }

      const msalInstance = this.getMsalInstance(this.msalConfig);

      // trigger the first leg of auth code flow
      return this.redirectToAuthCodeUrl(
        authCodeUrlRequestParams,
        authCodeRequestParams,
        msalInstance,
      )(ctx, next);
    };
  }

  acquireToken(options: Options = {}) {
    return async (
      ctx: Context<AppState>,
      next: () => Promise<unknown>,
    ) => {
      try {
        const msalInstance = this.getMsalInstance(this.msalConfig);

        /**
         * If a token cache exists in the session, deserialize it and set it as the
         * cache for the new MSAL CCA instance. For more, see:
         * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/caching.md
         */
        const tokenCache = ctx.state.session.get("tokenCache");
        if (tokenCache && typeof tokenCache === "string") {
          msalInstance.getTokenCache().deserialize(tokenCache);
        }
        const account = ctx.state.session.get("tokenCache");
        if (!account) throw new Error("no account");
        const tokenResponse = await msalInstance.acquireTokenSilent({
          account: account as msal.AccountInfo,
          scopes: options.scopes || [],
        });

        /**
         * On successful token acquisition, write the updated token
         * cache back to the session. For more, see:
         * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-node/docs/caching.md
         */
        ctx.state.session.set(
          "tokenCache",
          msalInstance.getTokenCache()
            .serialize(),
        );
        ctx.state.session.set("accessToken", tokenResponse.accessToken);
        ctx.state.session.set("idToken", tokenResponse.idToken);
        ctx.state.session.set("account", tokenResponse.account);

        ctx.response.redirect(options.successRedirect || "/");
      } catch (error) {
        if (error instanceof msal.InteractionRequiredAuthError) {
          return this.login({
            scopes: options.scopes || [],
            redirectUri: options.redirectUri,
            successRedirect: options.successRedirect || "/",
          })(ctx, next);
        }

        await next();
      }
    };
  }

  handleRedirect(_options: Options = {}) {
    return async (
      ctx: Context<AppState>,
    ) => {
      const formData = await ctx.request.body.formData();
      if (!ctx.request.body || !ctx.state) {
        ctx.response.status = 400;
        ctx.response.body = JSON.stringify({
          message: "Missing authorization response.",
        });
        ctx.response.type = "application/json";
        return;
      }
      // The PKCE codes and auth-code request are written to the session
      // by the sign-in leg. If they're absent the callback was reached
      // without (or after losing) an active sign-in session — a bad
      // request, not a server error. Return 400 rather than throwing,
      // which in an async handler would crash the process.
      const pkceCodes = ctx.state.session.get("pkceCodes") as {
        verifier?: string;
      };
      if (
        !pkceCodes || typeof pkceCodes !== "object" ||
        !("verifier" in pkceCodes) || typeof pkceCodes.verifier !== "string"
      ) {
        ctx.response.status = 400;
        ctx.response.body = JSON.stringify({
          message: "No active sign-in session. Please start sign-in again.",
        });
        ctx.response.type = "application/json";
        return;
      }
      const authCodeRequestState: {
        scopes: Array<string>;
        redirectUri: string;
        code: string;
        state?: string;
      } = ctx.state.session.get("authCodeRequest") as {
        scopes: Array<string>;
        redirectUri: string;
        code: string;
        state?: string;
      };
      if (!authCodeRequestState) {
        ctx.response.status = 400;
        ctx.response.body = JSON.stringify({
          message: "No active sign-in session. Please start sign-in again.",
        });
        ctx.response.type = "application/json";
        return;
      }
      const code = formData.get("code")?.toString() as string;
      const authCodeRequest: msal.AuthorizationCodeRequest = {
        ...authCodeRequestState,
        code,
        codeVerifier: pkceCodes.verifier,
      };

      const msalInstance = this.getMsalInstance(this.msalConfig);
      const tokenCache: unknown = ctx.state.session.get("tokenCache");
      if (tokenCache && typeof tokenCache === "string") {
        msalInstance.getTokenCache().deserialize(
          tokenCache,
        );
      }

      const authPayload: msal.AuthorizationCodePayload = {
        code: formData.get("code") as string,
        state: formData.get("state") as string,
      };
      const tokenResponse = await msalInstance.acquireTokenByCode(
        authCodeRequest,
        authPayload,
      );

      ctx.state.session.set(
        "tokenCache",
        msalInstance.getTokenCache()
          .serialize(),
      );
      ctx.state.session.set("idToken", tokenResponse.idToken);
      ctx.state.session.set("account", tokenResponse.account);
      ctx.state.session.set("isAuthenticated", true);
      const s = formData.get("state")?.toString();
      const state = s
        ? JSON.parse(
          this.cryptoProvider.base64Decode(s),
        )
        : undefined;
      ctx.response.redirect(state?.successRedirect ?? "/");
    };
  }

  logout(options: Options = {}) {
    return (ctx: Context<AppState>, _next?: () => Promise<unknown>) => {
      /**
       * Construct a logout URI and redirect the user to end the
       * session with Azure AD. For more information, visit:
       * https://docs.microsoft.com/azure/active-directory/develop/v2-protocols-oidc#send-a-sign-out-request
       */
      let logoutUri = `${this.msalConfig.auth.authority}/oauth2/v2.0/`;

      if (options.postLogoutRedirectUri) {
        logoutUri +=
          `logout?post_logout_redirect_uri=${options.postLogoutRedirectUri}`;
      }

      //   req.session.destroy(() => {
      //     res.redirect(logoutUri);
      //   });
      ctx.response.redirect(logoutUri);
    };
  }

  /**
   * Logs the user out of this web service only by destroying the local
   * session, without ending the user's Azure AD session. The user remains
   * signed in to Microsoft and other Microsoft-integrated apps.
   */
  logoutLocal(options: Options = {}) {
    return async (
      ctx: Context<AppState>,
      next?: () => Promise<unknown>,
    ) => {
      await ctx.state.session.deleteSession();
      ctx.response.redirect(options.successRedirect || "/login");
      if (next) return await next();
    };
  }

  /**
   * Instantiates a new MSAL ConfidentialClientApplication object
   * @param msalConfig: MSAL Node Configuration object
   * @returns
   */
  getMsalInstance(msalConfig: msal.Configuration) {
    return new msal.ConfidentialClientApplication(msalConfig);
  }

  /**
   * Prepares the auth code request parameters and initiates the first leg of auth code flow
   * @param req: Express request object
   * @param res: Express response object
   * @param next: Express next function
   * @param authCodeUrlRequestParams: parameters for requesting an auth code url
   * @param authCodeRequestParams: parameters for requesting tokens using auth code
   */
  redirectToAuthCodeUrl(
    authCodeUrlRequestParams: AuthCodeUrlRequestParams,
    authCodeRequestParams: AuthCodeRequestParams,
    msalInstance: msal.ConfidentialClientApplication,
  ) {
    return async (
      ctx: Context<AppState>,
      next?: () => Promise<unknown>,
    ) => {
      // Generate PKCE Codes before starting the authorization flow
      const { verifier, challenge } = await this.cryptoProvider
        .generatePkceCodes();
      const pkceCodes = {
        challengeMethod: "S256",
        verifier: verifier,
        challenge: challenge,
      };
      // Set generated PKCE codes and method as session vars
      ctx.state.session.set("pkceCodes", pkceCodes);

      /**
       * By manipulating the request objects below before each request, we can obtain
       * auth artifacts with desired claims. For more information, visit:
       * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationurlrequest
       * https://azuread.github.io/microsoft-authentication-library-for-js/ref/modules/_azure_msal_node.html#authorizationcoderequest
       */
      ctx.state.session.set("authCodeUrlRequest", {
        ...authCodeUrlRequestParams,
        responseMode: msal.ResponseMode.FORM_POST, // recommended for confidential clients
        codeChallenge: pkceCodes.challenge,
        codeChallengeMethod: pkceCodes.challengeMethod,
      });

      ctx.state.session.set("authCodeRequest", {
        ...authCodeRequestParams,
        code: "",
      });

      const authCodeUrlRequest = ctx.state.session.get("authCodeUrlRequest");
      if (!authCodeUrlRequest) {
        throw new Error("no authCodeUrlRequest");
      }
      const authCodeUrlResponse = await msalInstance.getAuthCodeUrl(
        authCodeUrlRequest as msal.AuthorizationUrlRequest,
      );
      ctx.response.redirect(authCodeUrlResponse);
      if (next) return await next();
    };
  }

  /**
   * Retrieves cloud discovery metadata from the /discovery/instance endpoint
   * @returns
   */
  async getCloudDiscoveryMetadata(authority: string) {
    const endpoint = new URL(
      "https://login.microsoftonline.com/common/discovery/instance",
    );
    endpoint.searchParams.set("api-version", "1.1");
    endpoint.searchParams.set(
      "authorization_endpoint",
      `${authority}/oauth2/v2.0/authorize`,
    );
    try {
      const response = await fetch(endpoint);
      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieves oidc metadata from the openid endpoint
   * @returns
   */
  async getAuthorityMetadata(authority: string) {
    const endpoint = `${authority}/v2.0/.well-known/openid-configuration`;

    try {
      const response = await fetch(endpoint);
      return await response.json();
    } catch (error) {
      console.log(error);
    }
  }
}

const authProvider = new AuthProvider(msalConfig);

export default authProvider;
