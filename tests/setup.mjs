// Unit tests must provide explicit upstream fixtures; integration tests are separate.
globalThis.fetch = async () => {
  throw new Error('Unexpected network request in a unit test. Provide an explicit fetch fixture.');
};
