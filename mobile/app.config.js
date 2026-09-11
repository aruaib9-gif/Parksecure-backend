// Dynamic Expo config. app.json holds the static base; this layer supplies the
// API URL so a build can be pointed at any backend without editing tracked files:
//
//   PARKSECURE_API_URL=https://my-api.onrender.com npx expo start
//   PARKSECURE_API_URL=https://my-api.onrender.com npx expo prebuild --clean
//
// This is only the *default* baked into the binary — users can override it at
// runtime from the login screen (see setApiUrl in src/api/client.js), so a
// released APK is not locked to one server.
const DEFAULT_API_URL = 'https://parksecure-api.onrender.com';

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiUrl: process.env.PARKSECURE_API_URL || DEFAULT_API_URL,
  },
});
