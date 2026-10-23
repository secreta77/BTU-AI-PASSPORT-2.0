// Production environment: replaces environment.ts in the production build (angular.json fileReplacements).
export const environment = {
  apiUrl: '/api',
  // Must stay false: a fake "authentic" result must never appear in production.
  useMockApi: false,
};
