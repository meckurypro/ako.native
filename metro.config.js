// File: metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// inlineVariables:false — theme tokens (--color-*) are overridden at runtime
// by ThemeProvider (dark mode + page mode), so they must stay real variables
// instead of being inlined at build time.
module.exports = withNativewind(config, { inlineVariables: false });
