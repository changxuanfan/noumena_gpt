window.__ModuleLoader__.load({
	id: "dsh-skill-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/SkillManagerSection.ts
		function SkillManagerSection({ t }) {
			return (0, react.createElement)("section", { "aria-labelledby": "dsh-skill-manager-title" }, (0, react.createElement)("h2", { id: "dsh-skill-manager-title" }, t("title")), (0, react.createElement)("p", null, t("introduction")));
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			nav: "Skill Manager",
			title: "Skill Manager",
			introduction: "Browse and manage Skills.sh skills without leaving DSH."
		};
		const zh = {
			nav: "技能管理",
			title: "技能管理",
			introduction: "无需离开 DSH，即可浏览和管理 Skills.sh 技能。"
		};
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
			}, () => (0, react.createElement)(SkillManagerSection, { t })));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map