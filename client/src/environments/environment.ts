// Development environment (default file).
// Relative URL: in dev, proxy.conf.json forwards /api to the Express server.
export const environment = {
  apiUrl: '/api',
  // Mock answers for the verify page until the API is reachable locally.
  // environment.prod.ts always sets this to false.
  useMockApi: true,
};
