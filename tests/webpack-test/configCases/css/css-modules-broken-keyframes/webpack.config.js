const webpack = require("@rspack/core");
const path = require("path");

/** @type {function(any, any): import("@rspack/core").Configuration} */
module.exports = (env, { testPath }) => ({
	target: "web",
	mode: "production",
	output: {
		uniqueName: "my-app"
	},
	experiments: {
		css: true
	},
	plugins: [
		new webpack.ids.DeterministicModuleIdsPlugin({
			maxLength: 3,
			failOnConflict: true,
			fixedLength: true,
			test: m => m.type.startsWith("css")
		}),
		new webpack.experiments.ids.SyncModuleIdsPlugin({
			test: m => m.type.startsWith("css"),
			path: path.resolve(testPath, "module-ids.json"),
			mode: "create"
		})
	]
});
