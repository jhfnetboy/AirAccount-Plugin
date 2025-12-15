module.exports = {
  env: {
    node: true, // This enables Node.js global variables (like Buffer, console)
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Disable unused vars for this fake server, as it might have some for demo purposes
    'no-unused-vars': 'off',
    // Allow console logs
    'no-console': 'off',
    // Disable specific import warning if it's not relevant here
    // 'import-x/no-named-as-default-member': 'off', // This rule comes from eslint-plugin-import-x, which is not installed here
  },
};
