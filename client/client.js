window.__ModuleLoader__.load({
	id: "dsh-skill-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/SkillManagerSection.ts
		function formatInstalls(installs) {
			return new Intl.NumberFormat().format(installs);
		}
		function SkillManagerSection({ t, search, prepareInstall, confirmInstall, listManagedSkills }) {
			const [query, setQuery] = (0, react.useState)("");
			const [submittedQuery, setSubmittedQuery] = (0, react.useState)("");
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const [installState, setInstallState] = (0, react.useState)({ status: "idle" });
			const [inventoryVersion, setInventoryVersion] = (0, react.useState)(0);
			const [inventoryState, setInventoryState] = (0, react.useState)({ status: "loading" });
			const activeRequest = (0, react.useRef)(null);
			const activePreparation = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => {
				activeRequest.current?.abort();
				activePreparation.current?.abort();
			}, []);
			(0, react.useEffect)(() => {
				let current = true;
				setInventoryState({ status: "loading" });
				listManagedSkills().then((skills) => {
					if (current) setInventoryState({
						status: "ready",
						skills
					});
				}, (error) => {
					if (current) setInventoryState({
						status: "error",
						message: error instanceof Error ? error.message : t("inventoryError")
					});
				});
				return () => {
					current = false;
				};
			}, [
				inventoryVersion,
				listManagedSkills,
				t
			]);
			const runSearch = async (nextQuery) => {
				const normalizedQuery = nextQuery.trim();
				if (normalizedQuery.length === 0) return;
				activeRequest.current?.abort();
				const controller = new AbortController();
				activeRequest.current = controller;
				setSubmittedQuery(normalizedQuery);
				setState({ status: "loading" });
				try {
					const results = await search(normalizedQuery, controller.signal);
					if (activeRequest.current === controller) setState({
						status: "ready",
						results
					});
				} catch (error) {
					if (controller.signal.aborted || activeRequest.current !== controller) return;
					setState({
						status: "error",
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const submit = (event) => {
				event.preventDefault();
				runSearch(query);
			};
			const beginInstall = async (skill) => {
				activePreparation.current?.abort();
				const controller = new AbortController();
				activePreparation.current = controller;
				setInstallState({ status: "preparing" });
				try {
					const prepared = await prepareInstall(skill.id, controller.signal);
					if (activePreparation.current === controller) setInstallState({
						status: "confirming",
						prepared
					});
				} catch (error) {
					if (controller.signal.aborted || activePreparation.current !== controller) return;
					setInstallState({
						status: "error",
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const finishInstall = async (prepared) => {
				setInstallState({
					status: "installing",
					prepared
				});
				try {
					const skill = await confirmInstall(prepared.operationId, prepared.collision === "managed");
					setInstallState({
						status: "success",
						skill
					});
					setInventoryVersion((version) => version + 1);
				} catch (error) {
					setInstallState({
						status: "error",
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			return (0, react.createElement)("section", { "aria-labelledby": "dsh-skill-manager-title" }, (0, react.createElement)("h2", { id: "dsh-skill-manager-title" }, t("title")), (0, react.createElement)("p", null, t("introduction")), (0, react.createElement)("form", { onSubmit: submit }, (0, react.createElement)("label", { htmlFor: "dsh-skill-search" }, t("searchLabel")), (0, react.createElement)("input", {
				id: "dsh-skill-search",
				name: "query",
				type: "search",
				value: query,
				placeholder: t("searchPlaceholder"),
				onChange: (event) => setQuery(event.currentTarget.value)
			}), (0, react.createElement)("button", {
				type: "submit",
				disabled: query.trim().length === 0
			}, t("searchAction"))), state.status === "loading" ? (0, react.createElement)("p", {
				role: "status",
				"aria-live": "polite"
			}, t("searching")) : null, state.status === "error" ? (0, react.createElement)("div", null, (0, react.createElement)("p", { role: "alert" }, state.message), (0, react.createElement)("button", {
				type: "button",
				onClick: () => void runSearch(submittedQuery)
			}, t("retry"))) : null, state.status === "ready" && state.results.length === 0 ? (0, react.createElement)("p", { role: "status" }, t("empty")) : null, state.status === "ready" && state.results.length > 0 ? (0, react.createElement)("ul", { "aria-label": t("searchLabel") }, ...state.results.map((skill) => (0, react.createElement)("li", { key: skill.id }, (0, react.createElement)("article", null, (0, react.createElement)("h3", null, skill.name), (0, react.createElement)("p", null, skill.description ?? t("descriptionUnavailable")), (0, react.createElement)("p", null, skill.source), (0, react.createElement)("p", null, `${formatInstalls(skill.installs)} ${t("installs")}`), (0, react.createElement)("a", {
				href: skill.pageUrl,
				target: "_blank",
				rel: "noreferrer"
			}, t("openPage")), (0, react.createElement)("button", {
				type: "button",
				disabled: installState.status === "preparing" || installState.status === "installing",
				onClick: () => void beginInstall(skill)
			}, t("install")))))) : null, installState.status === "preparing" ? (0, react.createElement)("p", {
				role: "status",
				"aria-live": "polite"
			}, t("preparingInstall")) : null, installState.status === "confirming" ? (0, react.createElement)("div", {
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "dsh-skill-install-confirmation"
			}, (0, react.createElement)("h3", { id: "dsh-skill-install-confirmation" }, t("confirmInstallTitle")), (0, react.createElement)("strong", null, installState.prepared.name), (0, react.createElement)("p", null, installState.prepared.description), (0, react.createElement)("p", null, installState.prepared.source), (0, react.createElement)("p", null, installState.prepared.collision === "managed" ? t("overwritePrompt") : t("installPrompt")), (0, react.createElement)("button", {
				type: "button",
				onClick: () => setInstallState({ status: "idle" })
			}, t("cancel")), (0, react.createElement)("button", {
				type: "button",
				onClick: () => void finishInstall(installState.prepared)
			}, installState.prepared.collision === "managed" ? t("confirmOverwrite") : t("confirmInstall"))) : null, installState.status === "installing" ? (0, react.createElement)("p", {
				role: "status",
				"aria-live": "polite"
			}, t("installing")) : null, installState.status === "success" ? (0, react.createElement)("p", { role: "status" }, `${t("installed")} ${installState.skill.name}`) : null, installState.status === "error" ? (0, react.createElement)("p", { role: "alert" }, installState.message) : null, (0, react.createElement)("h2", null, t("installedTitle")), inventoryState.status === "loading" ? (0, react.createElement)("p", { role: "status" }, t("loadingInstalled")) : null, inventoryState.status === "error" ? (0, react.createElement)("div", null, (0, react.createElement)("p", { role: "alert" }, inventoryState.message), (0, react.createElement)("button", {
				type: "button",
				onClick: () => setInventoryVersion((version) => version + 1)
			}, t("retry"))) : null, inventoryState.status === "ready" && inventoryState.skills.length === 0 ? (0, react.createElement)("p", null, t("noInstalled")) : null, inventoryState.status === "ready" && inventoryState.skills.length > 0 ? (0, react.createElement)("ul", { "aria-label": t("installedTitle") }, ...inventoryState.skills.map((skill) => (0, react.createElement)("li", { key: skill.name }, (0, react.createElement)("article", null, (0, react.createElement)("h3", null, skill.name), (0, react.createElement)("p", null, skill.description), (0, react.createElement)("p", null, skill.source), (0, react.createElement)("p", null, t(skill.state === "current" ? "stateCurrent" : skill.state === "locally-modified" ? "stateModified" : skill.state === "missing" ? "stateMissing" : "stateInvalid")), (0, react.createElement)("a", {
				href: skill.pageUrl,
				target: "_blank",
				rel: "noreferrer"
			}, t("openPage")))))) : null);
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			nav: "Skill Manager",
			title: "Skill Manager",
			introduction: "Browse and manage Skills.sh skills without leaving DSH.",
			searchLabel: "Search Skills.sh",
			searchPlaceholder: "Try react, testing, or debugging",
			searchAction: "Search",
			searching: "Searching Skills.sh...",
			empty: "No matching skills were found.",
			descriptionUnavailable: "No description is currently available.",
			installs: "installs",
			openPage: "Open on Skills.sh",
			install: "Install",
			preparingInstall: "Preparing installation...",
			confirmInstallTitle: "Confirm skill installation",
			confirmInstall: "Install skill",
			confirmOverwrite: "Overwrite and reinstall",
			installPrompt: "Install this validated skill into the DSH Skills Root?",
			overwritePrompt: "This Managed Skill already exists. Reinstalling will overwrite its current files.",
			cancel: "Cancel",
			installing: "Installing skill...",
			installed: "Skill installed successfully.",
			installedTitle: "Managed Skills",
			loadingInstalled: "Loading Managed Skills...",
			noInstalled: "No skills are managed by this plugin yet.",
			inventoryError: "Managed Skills could not be loaded.",
			stateCurrent: "Current",
			stateModified: "Locally modified",
			stateMissing: "Missing from disk",
			stateInvalid: "Invalid local skill",
			retry: "Retry",
			genericError: "The search failed. Try again."
		};
		const zh = {
			nav: "技能管理",
			title: "技能管理",
			introduction: "无需离开 DSH，即可浏览和管理 Skills.sh 技能。",
			searchLabel: "搜索 Skills.sh",
			searchPlaceholder: "例如 react、测试或调试",
			searchAction: "搜索",
			searching: "正在搜索 Skills.sh……",
			empty: "没有找到匹配的技能。",
			descriptionUnavailable: "暂时无法获取技能简介。",
			installs: "次安装",
			openPage: "在 Skills.sh 上查看",
			install: "安装",
			preparingInstall: "正在准备安装……",
			confirmInstallTitle: "确认安装技能",
			confirmInstall: "安装技能",
			confirmOverwrite: "覆盖并重新安装",
			installPrompt: "将这个已经验证的技能安装到 DSH 技能目录吗？",
			overwritePrompt: "这个托管技能已经存在，重新安装会覆盖其当前文件。",
			cancel: "取消",
			installing: "正在安装技能……",
			installed: "技能安装成功。",
			installedTitle: "托管技能",
			loadingInstalled: "正在加载托管技能……",
			noInstalled: "这个插件还没有管理任何技能。",
			inventoryError: "无法加载托管技能。",
			stateCurrent: "当前版本",
			stateModified: "本机已修改",
			stateMissing: "本机文件缺失",
			stateInvalid: "本机技能无效",
			retry: "重试",
			genericError: "搜索失败，请重试。"
		};
		//#endregion
		//#region src/contracts.ts
		function isRecord(value) {
			return typeof value === "object" && value !== null;
		}
		function isCatalogSkill(value) {
			if (!isRecord(value)) return false;
			return typeof value.id === "string" && typeof value.name === "string" && (typeof value.description === "string" || value.description === null) && typeof value.source === "string" && typeof value.installs === "number" && Number.isFinite(value.installs) && typeof value.pageUrl === "string";
		}
		function isSearchEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			if (value.ok) return Array.isArray(value.results) && value.results.every(isCatalogSkill);
			return isRecord(value.error) && isSearchErrorCode(value.error.code) && typeof value.error.message === "string";
		}
		function isSearchErrorCode(value) {
			return value === "invalid-query" || value === "network" || value === "timeout" || value === "upstream" || value === "invalid-response";
		}
		function isPublicError(value) {
			return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
		}
		function isPreparedInstall(value) {
			if (!isRecord(value)) return false;
			return typeof value.operationId === "string" && typeof value.name === "string" && typeof value.description === "string" && typeof value.source === "string" && typeof value.pageUrl === "string" && (value.collision === "none" || value.collision === "managed") && typeof value.expiresAt === "string";
		}
		function isManagedSkill(value) {
			if (!isRecord(value)) return false;
			return [
				"name",
				"description",
				"catalogId",
				"source",
				"pageUrl",
				"remoteHash",
				"localHash",
				"installedAt",
				"updatedAt"
			].every((key) => typeof value[key] === "string");
		}
		function isManagedSkillInventoryItem(value) {
			return isManagedSkill(value) && isRecord(value) && (value.state === "current" || value.state === "locally-modified" || value.state === "missing" || value.state === "invalid");
		}
		function isPrepareInstallEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			return value.ok ? isPreparedInstall(value.prepared) : isPublicError(value.error);
		}
		function isConfirmInstallEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			return value.ok ? isManagedSkill(value.skill) : isPublicError(value.error);
		}
		function isInventoryEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			return value.ok ? Array.isArray(value.skills) && value.skills.every(isManagedSkillInventoryItem) : isPublicError(value.error);
		}
		//#endregion
		//#region src/client/search-api.ts
		var CatalogSearchError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "CatalogSearchError";
			}
		};
		async function searchCatalog(query, signal) {
			const url = new URL("/dsh-skill-manager/api/search", location.origin);
			url.searchParams.set("q", query);
			let response;
			try {
				response = await fetch(url, {
					headers: { accept: "application/json" },
					signal
				});
			} catch (error) {
				if (signal.aborted) throw error;
				throw new CatalogSearchError("network", "Unable to reach the DSH host.");
			}
			let body;
			try {
				body = await response.json();
			} catch {
				throw new CatalogSearchError("invalid-response", "The DSH host returned an invalid response.");
			}
			if (!isSearchEnvelope(body)) throw new CatalogSearchError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new CatalogSearchError(body.error.code, body.error.message);
			return body.results;
		}
		//#endregion
		//#region src/client/install-api.ts
		var InstallApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "InstallApiError";
			}
		};
		async function postJson(path, body, signal) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: {
						accept: "application/json",
						"content-type": "application/json"
					},
					body: JSON.stringify(body),
					signal
				});
			} catch (error) {
				if (signal?.aborted) throw error;
				throw new InstallApiError("network", "Unable to reach the DSH host.");
			}
			try {
				return await response.json();
			} catch {
				throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			}
		}
		async function prepareInstall(id, signal) {
			const body = await postJson("/dsh-skill-manager/api/install/prepare", { id }, signal);
			if (!isPrepareInstallEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.prepared;
		}
		async function confirmInstall(operationId, overwrite) {
			const body = await postJson("/dsh-skill-manager/api/install/confirm", {
				operationId,
				overwrite
			});
			if (!isConfirmInstallEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.skill;
		}
		//#endregion
		//#region src/client/inventory-api.ts
		async function listManagedSkills() {
			let response;
			try {
				response = await fetch("/dsh-skill-manager/api/installed", { headers: { accept: "application/json" } });
			} catch {
				throw new InstallApiError("network", "Unable to reach the DSH host.");
			}
			let body;
			try {
				body = await response.json();
			} catch {
				throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			}
			if (!isInventoryEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.skills;
		}
		//#endregion
		//#region src/client/index.ts
		const namespace = "dsh-skill-manager";
		const name = namespace;
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(namespace, {
				en,
				zh
			}), "dsh-skill-manager: dictionaries");
			const t = ctx.locale.bind(namespace);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skill-manager",
				order: 45,
				label: () => t("nav"),
				locale: namespace,
				inject: () => ({ t })
			}, () => (0, react.createElement)(SkillManagerSection, {
				t,
				search: searchCatalog,
				prepareInstall,
				confirmInstall,
				listManagedSkills
			})));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map