// WebAssembly modules imported with Vite/Wrangler's plain imports.
declare module "*.wasm" {
	const wasm: WebAssembly.Module;
	export default wasm;
}
