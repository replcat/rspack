import fs from "node:fs";
import path from "node:path";

import type {
	ECompilerType,
	ITestEnv,
	ITestRunner,
	TCompilerOptions,
	TCompilerStatsCompilation,
	TTestConfig
} from "../../type";
import type {
	IBasicGlobalContext,
	IBasicModuleScope,
	TBasicRunnerFile,
	TModuleObject,
	TRunnerRequirer
} from "../type";

const isRelativePath = (p: string) => /^\.\.?\//.test(p);
const getSubPath = (p: string) => {
	const lastSlash = p.lastIndexOf("/");
	let firstSlash = p.indexOf("/");

	if (lastSlash !== -1 && firstSlash !== lastSlash) {
		if (firstSlash !== -1) {
			let next = p.indexOf("/", firstSlash + 1);
			let dir = p.slice(firstSlash + 1, next);

			while (dir === ".") {
				firstSlash = next;
				next = p.indexOf("/", firstSlash + 1);
				dir = p.slice(firstSlash + 1, next);
			}
		}

		return p.slice(firstSlash + 1, lastSlash + 1);
	}
	return "";
};

const cached = new Map<string, TBasicRunnerFile>();

export interface IBasicRunnerOptions<T extends ECompilerType> {
	env: ITestEnv;
	stats?: () => TCompilerStatsCompilation<T>;
	name: string;
	runInNewContext?: boolean;
	testConfig: TTestConfig<T>;
	source: string;
	dist: string;
	compilerOptions: TCompilerOptions<T>;
	cachable?: boolean;
}

export abstract class BasicRunner<
	T extends ECompilerType = ECompilerType.Rspack
> implements ITestRunner
{
	protected globalContext: IBasicGlobalContext | null = null;
	protected baseModuleScope: IBasicModuleScope | null = null;
	protected requirers: Map<string, TRunnerRequirer> = new Map();
	constructor(protected _options: IBasicRunnerOptions<T>) {}

	run(file: string): Promise<unknown> {
		if (!this.globalContext) {
			this.globalContext = this.createGlobalContext();
		}
		this.baseModuleScope = this.createBaseModuleScope();
		if (typeof this._options.testConfig.moduleScope === "function") {
			this._options.testConfig.moduleScope(
				this.baseModuleScope,
				this._options.stats
			);
		}
		this.createRunner();
		const res = this.getRequire()(
			this._options.dist,
			file.startsWith("./") ? file : `./${file}`
		);
		if (typeof res === "object" && "then" in res) {
			return res;
		}
		return Promise.resolve(res);
	}

	getRequire(): TRunnerRequirer {
		const entryRequire = this.requirers.get("entry")!;
		return (currentDirectory, modulePath, context = {}) => {
			const p = Array.isArray(modulePath)
				? modulePath
				: modulePath.split("?")[0]!;
			return entryRequire(currentDirectory, p, context);
		};
	}

	getGlobal(name: string): unknown {
		return ((this.globalContext || {}) as Record<string, unknown>)[name];
	}

	protected abstract createGlobalContext(): IBasicGlobalContext;
	protected abstract createBaseModuleScope(): IBasicModuleScope;
	protected abstract createModuleScope(
		requireFn: TRunnerRequirer,
		m: TModuleObject,
		file: TBasicRunnerFile
	): IBasicModuleScope;

	protected getFile(
		modulePath: string[] | string,
		currentDirectory: string
	): TBasicRunnerFile | null {
		const cacheKey = `${currentDirectory}|${modulePath}`;
		if (this._options.cachable && cached.has(cacheKey)) {
			return cached.get(cacheKey)!;
		}
		let res = null;
		if (Array.isArray(modulePath)) {
			res = {
				path: path.join(currentDirectory, ".array-require.js"),
				content: `module.exports = (${modulePath
					.map(arg => {
						return `require(${JSON.stringify(`./${arg}`)})`;
					})
					.join(", ")});`,
				subPath: ""
			};
		} else if (isRelativePath(modulePath)) {
			const p = path.join(currentDirectory, modulePath);
			res = {
				path: p,
				content: fs.readFileSync(p, "utf-8"),
				subPath: getSubPath(modulePath)
			};
		} else if (path.isAbsolute(modulePath)) {
			res = {
				path: modulePath,
				content: fs.readFileSync(modulePath, "utf-8"),
				subPath: "absolute_path"
			};
		}
		if (this._options.cachable && res) {
			cached.set(cacheKey, res);
		}
		return res;
	}

	protected preExecute(code: string, file: TBasicRunnerFile) {}
	protected postExecute(m: Object, file: TBasicRunnerFile) {}

	protected createRunner() {
		this.requirers.set(
			"entry",
			(currentDirectory, modulePath, context = {}) => {
				throw new Error("Not implement");
			}
		);
	}
}
