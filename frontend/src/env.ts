type FrontendEnv = Record<string, string | undefined>;

const viteEnv = ((import.meta as unknown as { env?: FrontendEnv }).env ?? {});

export const frontendEnv = {
  evaluatorLoginEnabled: viteEnv.VITE_EVALUATOR_LOGIN_ENABLED === "true",
  evaluatorControlsEnabled: viteEnv.VITE_EVALUATOR_CONTROLS_ENABLED === "true"
};
