import type * as msal from "@azure/msal-node";
import { getEnvar, getEnvarOpt } from "./utils.ts";

export const GRAPH_ME_ENDPOINT = getEnvar("GRAPH_API_ENDPOINT") + "v1.0/me";

const authority = (getEnvarOpt("AZURE_CLOUD_INSTANCE") ??
  "https://login.microsoftonline.com/") +
  (getEnvarOpt("AZURE_TENANT_ID") ?? "organizations");
export const msalConfig: msal.Configuration = {
  auth: {
    clientId: getEnvar("AZURE_CLIENT_ID"), // 'Application (client) ID' of app registration in Azure portal - this value is a GUID
    authority, // Full directory URL, in the form of https://login.microsoftonline.com/<tenant>
    clientSecret: getEnvar("AZURE_CLIENT_SECRET"), // Client secret generated from the app registration in Azure portal
  },
  system: {
    loggerOptions: {
      loggerCallback(_loglevel, _message, _containsPii) {
        // console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3,
    },
  },
};

export const REDIRECT_URI: string | undefined = getEnvarOpt("REDIRECT_URI");
export const POST_LOGOUT_REDIRECT_URI: string = getEnvarOpt(
  "POST_LOGOUT_REDIRECT_URI",
) ?? "/";
