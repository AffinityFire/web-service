import axios from "axios";

/**
 * Attaches a given access token to a MS Graph API call
 * @param endpoint: REST API endpoint to call
 * @param accessToken: raw access token string
 */
async function fetch(endpoint: string, accessToken: string) {
  const options = {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };

  console.log(`request made to ${endpoint} at: ` + new Date().toString());

  try {
    const response = await axios.get(endpoint, options);
    return await response.data;
  } catch (error) {
    throw new Error(error as string);
  }
}

export default fetch;
