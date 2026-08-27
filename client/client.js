window.__ModuleLoader__.load({
	id: "dsh-skill-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/ConfirmDialog.ts
		function ConfirmDialog({ titleId, title, confirmLabel, cancelLabel, danger = false, onCancel, onConfirm, children }) {
			const confirmButton = (0, react.useRef)(null);
			const previousFocus = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				confirmButton.current?.focus();
				return () => {
					const previous = previousFocus.current;
					const previousDisabled = previous instanceof HTMLButtonElement || previous instanceof HTMLInputElement || previous instanceof HTMLSelectElement || previous instanceof HTMLTextAreaElement ? previous.disabled : false;
					if (previous?.isConnected && !previousDisabled && previous.tabIndex >= 0) {
						previous.focus();
						return;
					}
					document.querySelector("#dsh-skill-manager-title")?.focus();
				};
			}, []);
			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
					return;
				}
				if (event.key !== "Tab") return;
				const focusable = [...event.currentTarget.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex=\"-1\"])")];
				if (focusable.length === 0) {
					event.preventDefault();
					return;
				}
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			};
			return (0, react.createElement)("div", { className: "dsm-dialog-backdrop" }, (0, react.createElement)("div", {
				className: "dsm-dialog",
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": titleId,
				onKeyDown
			}, (0, react.createElement)("h3", { id: titleId }, title), (0, react.createElement)("div", { className: "dsm-dialog-body" }, children), (0, react.createElement)("div", { className: "dsm-dialog-actions" }, (0, react.createElement)("button", {
				className: "dsm-button dsm-button-secondary",
				type: "button",
				onClick: onCancel
			}, cancelLabel), (0, react.createElement)("button", {
				className: danger ? "dsm-button dsm-button-danger" : "dsm-button dsm-button-primary",
				type: "button",
				ref: confirmButton,
				onClick: onConfirm
			}, confirmLabel))));
		}
		//#endregion
		//#region src/client/SkillManagerSection.ts
		function formatInstalls(installs) {
			return new Intl.NumberFormat().format(installs);
		}
		function SkillManagerSection({ t, search, prepareInstall, confirmInstall, listManagedSkills, checkSkillUpdate, confirmSkillUpdate, prepareSkillRemoval, confirmSkillRemoval }) {
			const [query, setQuery] = (0, react.useState)("");
			const [activeTab, setActiveTab] = (0, react.useState)("discover");
			const [submittedQuery, setSubmittedQuery] = (0, react.useState)("");
			const [state, setState] = (0, react.useState)({ status: "idle" });
			const [installState, setInstallState] = (0, react.useState)({ status: "idle" });
			const [inventoryVersion, setInventoryVersion] = (0, react.useState)(0);
			const [inventoryState, setInventoryState] = (0, react.useState)({ status: "loading" });
			const [updateState, setUpdateState] = (0, react.useState)({ status: "idle" });
			const [removalState, setRemovalState] = (0, react.useState)({ status: "idle" });
			const activeRequest = (0, react.useRef)(null);
			const activePreparation = (0, react.useRef)(null);
			const discoverTab = (0, react.useRef)(null);
			const managedTab = (0, react.useRef)(null);
			const operationBusy = installState.status === "preparing" || installState.status === "confirming" || installState.status === "installing" || updateState.status === "checking" || updateState.status === "confirming" || updateState.status === "updating" || removalState.status === "preparing" || removalState.status === "confirming" || removalState.status === "removing";
			const selectTab = (tab) => {
				setActiveTab(tab);
				(tab === "discover" ? discoverTab : managedTab).current?.focus();
			};
			const onTabKeyDown = (event) => {
				let next = null;
				if (event.key === "ArrowRight" || event.key === "ArrowDown") next = activeTab === "discover" ? "managed" : "discover";
				else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = activeTab === "managed" ? "discover" : "managed";
				else if (event.key === "Home") next = "discover";
				else if (event.key === "End") next = "managed";
				if (next === null) return;
				event.preventDefault();
				selectTab(next);
			};
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
				if (operationBusy) return;
				setUpdateState({ status: "idle" });
				setRemovalState({ status: "idle" });
				activePreparation.current?.abort();
				const controller = new AbortController();
				activePreparation.current = controller;
				setInstallState({
					status: "preparing",
					catalogId: skill.id
				});
				try {
					const prepared = await prepareInstall(skill.id, controller.signal);
					if (activePreparation.current === controller) setInstallState({
						status: "confirming",
						catalogId: skill.id,
						prepared
					});
				} catch (error) {
					if (controller.signal.aborted || activePreparation.current !== controller) return;
					setInstallState({
						status: "error",
						catalogId: skill.id,
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const finishInstall = async (catalogId, prepared) => {
				setInstallState({
					status: "installing",
					catalogId,
					prepared
				});
				try {
					const skill = await confirmInstall(prepared.operationId, prepared.collision === "managed");
					setInstallState({
						status: "success",
						catalogId,
						skill
					});
					setInventoryVersion((version) => version + 1);
				} catch (error) {
					setInstallState({
						status: "error",
						catalogId,
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const checkUpdate = async (name) => {
				if (operationBusy) return;
				setInstallState({ status: "idle" });
				setRemovalState({ status: "idle" });
				setUpdateState({
					status: "checking",
					name
				});
				try {
					const update = await checkSkillUpdate(name);
					setUpdateState(update.updateAvailable ? {
						status: "confirming",
						update
					} : {
						status: "result",
						update
					});
				} catch (error) {
					setUpdateState({
						status: "error",
						name,
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const applyUpdate = async (update) => {
				if (update.operationId === void 0) return;
				setUpdateState({
					status: "updating",
					update
				});
				try {
					const skill = await confirmSkillUpdate(update.operationId);
					setUpdateState({
						status: "success",
						name: skill.name
					});
					setInventoryVersion((version) => version + 1);
				} catch (error) {
					setUpdateState({
						status: "error",
						name: update.name,
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const beginRemoval = async (name) => {
				if (operationBusy) return;
				setInstallState({ status: "idle" });
				setUpdateState({ status: "idle" });
				setRemovalState({
					status: "preparing",
					name
				});
				try {
					const prepared = await prepareSkillRemoval(name);
					setRemovalState({
						status: "confirming",
						prepared
					});
				} catch (error) {
					setRemovalState({
						status: "error",
						name,
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const finishRemoval = async (prepared) => {
				setRemovalState({
					status: "removing",
					prepared
				});
				try {
					const name = await confirmSkillRemoval(prepared.operationId);
					setRemovalState({
						status: "success",
						name
					});
					setInventoryVersion((version) => version + 1);
				} catch (error) {
					setRemovalState({
						status: "error",
						name: prepared.name,
						message: error instanceof Error ? error.message : t("genericError")
					});
				}
			};
			const managedSkills = inventoryState.status === "ready" ? inventoryState.skills : [];
			const installedCatalogIds = new Set(managedSkills.map((skill) => skill.catalogId));
			if (installState.status === "success") installedCatalogIds.add(installState.catalogId);
			const updateMessage = updateState.status === "result" ? updateState.update.status === "current" ? t("upToDate") : updateState.update.status === "source-unavailable" ? t("sourceUnavailable") : updateState.update.status === "locally-modified" ? t("stateModified") : t("localInvalid") : null;
			const notice = installState.status === "preparing" ? {
				kind: "status",
				text: t("preparingInstall")
			} : installState.status === "installing" ? {
				kind: "status",
				text: t("installing")
			} : installState.status === "success" ? {
				kind: "success",
				text: `${t("installed")} ${installState.skill.name}`,
				viewManaged: true
			} : installState.status === "error" ? {
				kind: "error",
				text: installState.message
			} : updateState.status === "checking" ? {
				kind: "status",
				text: `${t("checkingUpdate")} ${updateState.name}`
			} : updateState.status === "updating" ? {
				kind: "status",
				text: t("updating")
			} : updateState.status === "success" ? {
				kind: "success",
				text: `${t("updated")} ${updateState.name}`
			} : updateState.status === "error" ? {
				kind: "error",
				text: updateState.message
			} : updateMessage !== null ? {
				kind: "status",
				text: updateMessage
			} : removalState.status === "preparing" ? {
				kind: "status",
				text: `${t("preparingRemoval")} ${removalState.name}`
			} : removalState.status === "removing" ? {
				kind: "status",
				text: t("removing")
			} : removalState.status === "success" ? {
				kind: "success",
				text: `${t("removed")} ${removalState.name}`
			} : removalState.status === "error" ? {
				kind: "error",
				text: removalState.message
			} : null;
			return (0, react.createElement)("section", {
				className: "dsm-root",
				"aria-labelledby": "dsh-skill-manager-title",
				"aria-busy": operationBusy
			}, (0, react.createElement)("header", { className: "dsm-header" }, (0, react.createElement)("h2", {
				id: "dsh-skill-manager-title",
				tabIndex: -1
			}, t("title")), (0, react.createElement)("p", { className: "dsm-subtitle" }, t("introduction"))), (0, react.createElement)("div", {
				className: "dsm-tabs",
				role: "tablist",
				"aria-label": t("title"),
				onKeyDown: onTabKeyDown
			}, (0, react.createElement)("button", {
				className: "dsm-tab",
				id: "dsm-discover-tab",
				type: "button",
				role: "tab",
				ref: discoverTab,
				tabIndex: activeTab === "discover" ? 0 : -1,
				"aria-selected": activeTab === "discover",
				"aria-controls": "dsm-discover-panel",
				onClick: () => setActiveTab("discover")
			}, t("discoverTab")), (0, react.createElement)("button", {
				className: "dsm-tab",
				id: "dsm-managed-tab",
				type: "button",
				role: "tab",
				ref: managedTab,
				tabIndex: activeTab === "managed" ? 0 : -1,
				"aria-selected": activeTab === "managed",
				"aria-controls": "dsm-managed-panel",
				onClick: () => setActiveTab("managed")
			}, `${t("managedTab")} (${managedSkills.length})`)), notice === null ? null : (0, react.createElement)("div", {
				className: `dsm-notice dsm-notice-${notice.kind}`,
				role: notice.kind === "error" ? "alert" : "status",
				"aria-live": notice.kind === "error" ? "assertive" : "polite"
			}, (0, react.createElement)("span", null, notice.text), "viewManaged" in notice && notice.viewManaged ? (0, react.createElement)("button", {
				className: "dsm-button dsm-button-secondary",
				type: "button",
				onClick: () => setActiveTab("managed")
			}, t("viewManaged")) : null), activeTab === "discover" ? (0, react.createElement)("section", {
				className: "dsm-panel",
				id: "dsm-discover-panel",
				role: "tabpanel",
				"aria-labelledby": "dsm-discover-tab"
			}, (0, react.createElement)("h2", { id: "dsm-search-title" }, t("searchLabel")), (0, react.createElement)("form", {
				className: "dsm-search",
				onSubmit: submit
			}, (0, react.createElement)("label", {
				className: "dsm-field",
				htmlFor: "dsh-skill-search"
			}, t("searchLabel"), (0, react.createElement)("input", {
				className: "dsm-input",
				id: "dsh-skill-search",
				name: "query",
				type: "search",
				value: query,
				placeholder: t("searchPlaceholder"),
				onChange: (event) => {
					setQuery(event.currentTarget.value);
				}
			})), (0, react.createElement)("button", {
				className: "dsm-button dsm-button-primary",
				type: "submit",
				disabled: query.trim().length === 0
			}, t("searchAction"))), state.status === "loading" ? (0, react.createElement)("p", {
				className: "dsm-status",
				role: "status",
				"aria-live": "polite"
			}, t("searching")) : null, state.status === "error" ? (0, react.createElement)("div", { className: "dsm-status dsm-error" }, (0, react.createElement)("p", { role: "alert" }, state.message), (0, react.createElement)("button", {
				className: "dsm-button dsm-button-secondary",
				type: "button",
				onClick: () => void runSearch(submittedQuery)
			}, t("retry"))) : null, state.status === "ready" && state.results.length === 0 ? (0, react.createElement)("p", {
				className: "dsm-empty",
				role: "status"
			}, t("empty")) : null, state.status === "ready" && state.results.length > 0 ? (0, react.createElement)("ul", {
				className: "dsm-list",
				"aria-label": t("searchLabel")
			}, ...state.results.map((skill) => {
				const isInstalled = installedCatalogIds.has(skill.id);
				const isTarget = installState.status !== "idle" && installState.catalogId === skill.id;
				const buttonLabel = isInstalled ? t("installedBadge") : isTarget && installState.status === "preparing" ? t("preparingInstall") : isTarget && installState.status === "installing" ? t("installing") : t("install");
				return (0, react.createElement)("li", { key: skill.id }, (0, react.createElement)("article", { className: "dsm-card" }, (0, react.createElement)("h3", null, skill.name), (0, react.createElement)("p", { className: "dsm-description" }, skill.description ?? t("descriptionUnavailable")), (0, react.createElement)("p", { className: "dsm-meta" }, skill.source), (0, react.createElement)("p", { className: "dsm-meta" }, `${formatInstalls(skill.installs)} ${t("installs")}`), isTarget && installState.status === "error" ? (0, react.createElement)("p", { className: "dsm-card-feedback dsm-error" }, installState.message) : null, isTarget && installState.status === "success" ? (0, react.createElement)("p", { className: "dsm-card-feedback dsm-success" }, t("installed")) : null, (0, react.createElement)("div", { className: "dsm-actions" }, (0, react.createElement)("a", {
					className: "dsm-link",
					href: skill.pageUrl,
					target: "_blank",
					rel: "noreferrer"
				}, t("openPage")), (0, react.createElement)("button", {
					className: "dsm-button dsm-button-primary",
					type: "button",
					disabled: operationBusy || isInstalled,
					onClick: () => void beginInstall(skill)
				}, buttonLabel))));
			})) : null) : null, installState.status === "confirming" ? (0, react.createElement)(ConfirmDialog, {
				titleId: "dsh-skill-install-confirmation",
				title: t("confirmInstallTitle"),
				cancelLabel: t("cancel"),
				confirmLabel: installState.prepared.collision === "managed" ? t("confirmOverwrite") : t("confirmInstall"),
				onCancel: () => setInstallState({ status: "idle" }),
				onConfirm: () => void finishInstall(installState.catalogId, installState.prepared)
			}, (0, react.createElement)("strong", null, installState.prepared.name), (0, react.createElement)("p", null, installState.prepared.description), (0, react.createElement)("p", null, installState.prepared.source), (0, react.createElement)("p", null, installState.prepared.collision === "managed" ? t("overwritePrompt") : t("installPrompt"))) : null, activeTab === "managed" ? (0, react.createElement)("section", {
				className: "dsm-panel",
				id: "dsm-managed-panel",
				role: "tabpanel",
				"aria-labelledby": "dsm-managed-tab"
			}, (0, react.createElement)("h2", { id: "dsm-installed-title" }, t("installedTitle")), inventoryState.status === "loading" ? (0, react.createElement)("p", {
				className: "dsm-status",
				role: "status"
			}, t("loadingInstalled")) : null, inventoryState.status === "error" ? (0, react.createElement)("div", { className: "dsm-status dsm-error" }, (0, react.createElement)("p", { role: "alert" }, inventoryState.message), (0, react.createElement)("button", {
				className: "dsm-button dsm-button-secondary",
				type: "button",
				onClick: () => setInventoryVersion((version) => version + 1)
			}, t("retry"))) : null, inventoryState.status === "ready" && inventoryState.skills.length === 0 ? (0, react.createElement)("p", { className: "dsm-empty" }, t("noInstalled")) : null, inventoryState.status === "ready" && inventoryState.skills.length > 0 ? (0, react.createElement)("ul", {
				className: "dsm-list",
				"aria-label": t("installedTitle")
			}, ...managedSkills.map((skill) => {
				const updateTargetsSkill = updateState.status !== "idle" && ("name" in updateState ? updateState.name === skill.name : updateState.update.name === skill.name);
				const removalTargetsSkill = removalState.status !== "idle" && ("name" in removalState ? removalState.name === skill.name : removalState.prepared.name === skill.name);
				return (0, react.createElement)("li", { key: skill.name }, (0, react.createElement)("article", { className: "dsm-card" }, (0, react.createElement)("h3", null, skill.name), (0, react.createElement)("p", { className: "dsm-description" }, skill.description), (0, react.createElement)("p", { className: "dsm-meta" }, skill.source), (0, react.createElement)("span", {
					className: "dsm-badge",
					"data-state": skill.state
				}, t(skill.state === "current" ? "stateCurrent" : skill.state === "locally-modified" ? "stateModified" : skill.state === "missing" ? "stateMissing" : "stateInvalid")), updateTargetsSkill && updateState.status === "result" ? (0, react.createElement)("p", { className: "dsm-card-feedback" }, updateMessage) : null, updateTargetsSkill && updateState.status === "error" ? (0, react.createElement)("p", { className: "dsm-card-feedback dsm-error" }, updateState.message) : null, updateTargetsSkill && updateState.status === "success" ? (0, react.createElement)("p", { className: "dsm-card-feedback dsm-success" }, t("updated")) : null, removalTargetsSkill && removalState.status === "error" ? (0, react.createElement)("p", { className: "dsm-card-feedback dsm-error" }, removalState.message) : null, (0, react.createElement)("div", { className: "dsm-actions" }, (0, react.createElement)("a", {
					className: "dsm-link",
					href: skill.pageUrl,
					target: "_blank",
					rel: "noreferrer"
				}, t("openPage")), (0, react.createElement)("button", {
					className: "dsm-button dsm-button-secondary",
					type: "button",
					disabled: operationBusy,
					onClick: () => void checkUpdate(skill.name)
				}, t("checkUpdate")), (0, react.createElement)("button", {
					className: "dsm-button dsm-button-danger",
					type: "button",
					disabled: operationBusy,
					onClick: () => void beginRemoval(skill.name)
				}, t("remove")))));
			})) : null) : null, updateState.status === "confirming" ? (0, react.createElement)(ConfirmDialog, {
				titleId: "dsh-skill-update-confirmation",
				title: t("confirmUpdateTitle"),
				cancelLabel: t("cancel"),
				confirmLabel: t("confirmUpdate"),
				onCancel: () => setUpdateState({ status: "idle" }),
				onConfirm: () => void applyUpdate(updateState.update)
			}, (0, react.createElement)("strong", null, updateState.update.name), (0, react.createElement)("p", null, updateState.update.status === "locally-modified" ? t("modifiedUpdatePrompt") : updateState.update.status === "local-invalid" ? t("repairUpdatePrompt") : t("updatePrompt"))) : null, removalState.status === "confirming" ? (0, react.createElement)(ConfirmDialog, {
				titleId: "dsh-skill-removal-confirmation",
				title: t("confirmRemovalTitle"),
				cancelLabel: t("cancel"),
				confirmLabel: t("confirmRemoval"),
				danger: true,
				onCancel: () => setRemovalState({ status: "idle" }),
				onConfirm: () => void finishRemoval(removalState.prepared)
			}, (0, react.createElement)("strong", null, removalState.prepared.name), (0, react.createElement)("p", null, removalState.prepared.state === "locally-modified" ? t("modifiedRemovePrompt") : removalState.prepared.state === "current" ? t("removePrompt") : t("invalidRemovePrompt"))) : null);
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			nav: "Skill Manager",
			title: "Skill Manager",
			introduction: "Browse and manage Skills.sh skills without leaving DSH.",
			discoverTab: "Discover",
			managedTab: "Managed Skills",
			viewManaged: "View Managed Skills",
			installedBadge: "Installed",
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
			checkUpdate: "Check for updates",
			checkingUpdate: "Checking for updates...",
			upToDate: "This skill is up to date.",
			updateAvailable: "An update is available.",
			sourceUnavailable: "The Skills.sh source is no longer available. The local skill has been preserved.",
			localInvalid: "The local skill is missing or invalid.",
			confirmUpdateTitle: "Confirm skill update",
			confirmUpdate: "Update skill",
			updatePrompt: "Replace the current files with the validated Skills.sh snapshot?",
			modifiedUpdatePrompt: "This skill has local modifications. Updating will overwrite those changes.",
			repairUpdatePrompt: "The local skill is missing or invalid. Updating will restore it from Skills.sh.",
			updating: "Updating skill...",
			updated: "Skill updated successfully.",
			remove: "Uninstall",
			preparingRemoval: "Preparing removal...",
			confirmRemovalTitle: "Confirm skill removal",
			removePrompt: "Remove this Managed Skill from DSH?",
			modifiedRemovePrompt: "This skill has local modifications. Uninstalling will permanently remove them.",
			invalidRemovePrompt: "This skill is missing or invalid. Uninstalling will remove its remaining files and ownership record.",
			confirmRemoval: "Uninstall skill",
			removing: "Uninstalling skill...",
			removed: "Skill uninstalled successfully.",
			retry: "Retry",
			genericError: "The search failed. Try again."
		};
		const zh = {
			nav: "技能管理",
			title: "技能管理",
			introduction: "无需离开 DSH，即可浏览和管理 Skills.sh 技能。",
			discoverTab: "发现技能",
			managedTab: "托管技能",
			viewManaged: "查看托管技能",
			installedBadge: "已安装",
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
			checkUpdate: "检查更新",
			checkingUpdate: "正在检查更新……",
			upToDate: "这个技能已经是最新版本。",
			updateAvailable: "发现可用更新。",
			sourceUnavailable: "Skills.sh 来源已经失效，本机技能仍然保留。",
			localInvalid: "本机技能缺失或无效。",
			confirmUpdateTitle: "确认更新技能",
			confirmUpdate: "更新技能",
			updatePrompt: "使用已验证的 Skills.sh 快照替换当前文件吗？",
			modifiedUpdatePrompt: "这个技能包含本机修改，更新会覆盖这些修改。",
			repairUpdatePrompt: "本机技能缺失或无效，更新会从 Skills.sh 恢复。",
			updating: "正在更新技能……",
			updated: "技能更新成功。",
			remove: "卸载",
			preparingRemoval: "正在准备卸载……",
			confirmRemovalTitle: "确认卸载技能",
			removePrompt: "从 DSH 中卸载这个托管技能吗？",
			modifiedRemovePrompt: "这个技能包含本机修改，卸载会永久删除这些修改。",
			invalidRemovePrompt: "这个技能缺失或无效，卸载会删除残留文件和托管记录。",
			confirmRemoval: "卸载技能",
			removing: "正在卸载技能……",
			removed: "技能卸载成功。",
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
			return value === "invalid-query" || value === "network" || value === "timeout" || value === "rate-limited" || value === "upstream" || value === "invalid-response";
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
		function isUpdateStatus(value) {
			return value === "current" || value === "available" || value === "locally-modified" || value === "local-invalid" || value === "source-unavailable";
		}
		function isUpdateCheckEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			if (!value.ok) return isPublicError(value.error);
			if (!isRecord(value.update)) return false;
			return typeof value.update.name === "string" && isUpdateStatus(value.update.status) && typeof value.update.updateAvailable === "boolean" && (value.update.operationId === void 0 || typeof value.update.operationId === "string") && (value.update.expiresAt === void 0 || typeof value.update.expiresAt === "string");
		}
		function isPreparedRemoval(value) {
			if (!isRecord(value)) return false;
			return typeof value.operationId === "string" && typeof value.name === "string" && typeof value.description === "string" && typeof value.source === "string" && (value.state === "current" || value.state === "locally-modified" || value.state === "missing" || value.state === "invalid") && typeof value.expiresAt === "string";
		}
		function isPrepareRemovalEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			return value.ok ? isPreparedRemoval(value.prepared) : isPublicError(value.error);
		}
		function isConfirmRemovalEnvelope(value) {
			if (!isRecord(value) || typeof value.ok !== "boolean") return false;
			return value.ok ? typeof value.name === "string" : isPublicError(value.error);
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
		//#region src/client/update-api.ts
		async function post$1(path, body) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: {
						accept: "application/json",
						"content-type": "application/json"
					},
					body: JSON.stringify(body)
				});
			} catch {
				throw new InstallApiError("network", "Unable to reach the DSH host.");
			}
			try {
				return await response.json();
			} catch {
				throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			}
		}
		async function checkSkillUpdate(name) {
			const body = await post$1("/dsh-skill-manager/api/update/check", { name });
			if (!isUpdateCheckEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.update;
		}
		async function confirmSkillUpdate(operationId) {
			const body = await post$1("/dsh-skill-manager/api/update/confirm", { operationId });
			if (!isConfirmInstallEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.skill;
		}
		//#endregion
		//#region src/client/remove-api.ts
		async function post(path, body) {
			let response;
			try {
				response = await fetch(path, {
					method: "POST",
					headers: {
						accept: "application/json",
						"content-type": "application/json"
					},
					body: JSON.stringify(body)
				});
			} catch {
				throw new InstallApiError("network", "Unable to reach the DSH host.");
			}
			try {
				return await response.json();
			} catch {
				throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			}
		}
		async function prepareSkillRemoval(name) {
			const body = await post("/dsh-skill-manager/api/remove/prepare", { name });
			if (!isPrepareRemovalEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.prepared;
		}
		async function confirmSkillRemoval(operationId) {
			const body = await post("/dsh-skill-manager/api/remove/confirm", { operationId });
			if (!isConfirmRemovalEnvelope(body)) throw new InstallApiError("invalid-response", "The DSH host returned an invalid response.");
			if (!body.ok) throw new InstallApiError(body.error.code, body.error.message);
			return body.name;
		}
		//#endregion
		//#region src/client/styles.ts
		const STYLE_ID = "dsh-skill-manager/styles";
		const STYLE_TEXT = `
.dsm-root{display:grid;gap:28px;padding:8px 4px 28px;color:var(--dsw-alias-label-primary,#171717)}
.dsm-header{display:grid;gap:8px}.dsm-header h2,.dsm-panel h2{margin:0}.dsm-subtitle{margin:0;color:var(--dsw-alias-label-secondary,#666)}
.dsm-tabs{display:flex;gap:6px;padding:4px;border-radius:12px;background:var(--dsw-alias-bg-layer-2,#f2f2f2)}.dsm-tab{flex:1;min-height:38px;padding:7px 12px;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-weight:700;cursor:pointer}.dsm-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#171717);box-shadow:0 1px 4px rgb(0 0 0/.1)}
.dsm-notice{position:sticky;z-index:5;top:0;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;box-sizing:border-box;padding:10px 13px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:11px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 4px 18px rgb(0 0 0/.12)}.dsm-notice-error{border-color:var(--dsw-alias-state-error-primary,#b82e2e);color:var(--dsw-alias-state-error-primary,#8e2424)}.dsm-notice-success{border-color:var(--dsw-alias-state-success-primary,#27834a)}
.dsm-panel{display:grid;gap:16px}.dsm-search{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
.dsm-field{display:grid;gap:7px;flex:1 1 320px;font-weight:600}.dsm-input{box-sizing:border-box;width:100%;min-height:40px;padding:8px 12px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit}
.dsm-button{min-height:36px;padding:7px 13px;border:1px solid transparent;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}.dsm-button:disabled{cursor:not-allowed;opacity:.5}.dsm-button-primary{background:var(--dsw-alias-button-primary-fill,#3b55d9);color:var(--dsw-alias-label-primary-inverted,#fff)}.dsm-button-secondary{border-color:var(--dsw-alias-border-l2,#d8d8d8);background:var(--dsw-alias-bg-layer-2,#f6f6f6);color:inherit}.dsm-button-danger{background:var(--dsw-alias-state-error-primary,#b82e2e);color:var(--dsw-alias-label-primary-inverted,#fff)}
.dsm-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:0;padding:0;list-style:none}.dsm-card{display:grid;align-content:start;gap:10px;min-width:0;height:100%;box-sizing:border-box;padding:16px;border:1px solid var(--dsw-alias-border-l2,#dedede);border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fafafa)}.dsm-card h3{margin:0;overflow-wrap:anywhere}.dsm-card p{margin:0;line-height:1.5}.dsm-description{color:var(--dsw-alias-label-secondary,#5f5f5f)}.dsm-meta{font-size:13px;color:var(--dsw-alias-label-tertiary,#707070)}.dsm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:4px}.dsm-link{align-content:center;color:var(--dsw-alias-label-primary,#1f1f1f);font-weight:600;text-decoration:underline;text-underline-offset:2px}
.dsm-status{margin:0;padding:11px 13px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f3f5ff)}.dsm-error{border:1px solid var(--dsw-alias-state-error-primary,#d97a7a);color:var(--dsw-alias-state-error-primary,#8e2424)}.dsm-empty{padding:24px;border:1px dashed var(--dsw-alias-border-l2,#ccc);border-radius:12px;text-align:center;color:var(--dsw-alias-label-secondary,#666)}
.dsm-card-feedback{margin:0;padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f3f5ff);font-size:13px}.dsm-card-feedback.dsm-error{background:var(--dsw-alias-bg-layer-2,#fff1f1)}.dsm-success{border:1px solid var(--dsw-alias-state-success-primary,#27834a);color:var(--dsw-alias-state-success-primary,#1d6c3b)}
.dsm-badge{justify-self:start;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-active,#e8edff);color:var(--dsw-alias-label-primary,#334bbd);font-size:12px;font-weight:700}.dsm-badge[data-state="locally-modified"],.dsm-badge[data-state="invalid"],.dsm-badge[data-state="missing"]{background:var(--dsw-alias-state-warn-primary,#fff0cd);color:var(--dsw-alias-state-warn-label,#805800)}
.dsm-dialog-backdrop{position:fixed;z-index:10000;inset:0;display:grid;place-items:center;padding:20px;background:var(--dsw-alias-bg-mask-1,rgb(0 0 0/.45))}.dsm-dialog{display:grid;gap:16px;width:min(460px,100%);max-height:min(680px,calc(100vh - 40px));overflow:auto;box-sizing:border-box;padding:22px;border-radius:16px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#171717);box-shadow:0 20px 60px rgb(0 0 0/.28)}.dsm-dialog h3{margin:0}.dsm-dialog-body{display:grid;gap:10px}.dsm-dialog-body p{margin:0;line-height:1.5}.dsm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
@media (max-width:640px){.dsm-list{grid-template-columns:1fr}.dsm-search>.dsm-button{width:100%}}
`;
		function installStyles() {
			if (document.querySelector(`style[data-plugin-css="dsh-skill-manager/styles"]`) !== null) return () => void 0;
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-skill-manager";
			style.dataset.pluginCss = STYLE_ID;
			style.textContent = STYLE_TEXT;
			document.head.appendChild(style);
			return () => style.remove();
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
			ctx.effect(installStyles, "dsh-skill-manager: styles");
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
				listManagedSkills,
				checkSkillUpdate,
				confirmSkillUpdate,
				prepareSkillRemoval,
				confirmSkillRemoval
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