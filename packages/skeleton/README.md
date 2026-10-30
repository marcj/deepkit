# skeleton package

This package can be copied when a new package should be created.

### Steps after copying:

- Adjust "name", "description", and "private" in `package.json`.
- Adjust README.md
- Put this package into root `/package.json` "jest.references".
- Put this package into root `/tsconfig.json` "references".
- Put this package into root `/tsconfig.esm.json` "references".
- Add dependencies to `package.json` and run `node sync-tsconfig-deps.js` to adjust tsconfig automatically.
- Add to .github/workflows/main.yml tsc build step if necessary.
