import "dotenv/config";
export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  llmApiUrl: process.env.LLM_API_URL ?? "",
  llmModel: process.env.LLM_MODEL ?? "",
  localLlmUrl: process.env.LOCAL_LLM_URL ?? "",
  localLlmModel: process.env.LOCAL_LLM_MODEL ?? "",
  vpsLlmUrl: process.env.VPS_LLM_URL ?? "",
  vpsLlmModel: process.env.VPS_LLM_MODEL ?? "",
};
