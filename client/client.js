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
		function SkillManagerSection({ t, search }) {
			const [query, setQuery] = (0, react.useState)("");
			const [submittedQuery, setSubmittedQuery] = (0, react.useState)("");
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const activeRequest = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => activeRequest.current?.abort(), []);
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
			return isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
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
				search: searchCatalog
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