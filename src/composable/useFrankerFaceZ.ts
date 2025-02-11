import { reactive, toRaw } from "vue";
import { log } from "@/common/Logger";
import { definePropertyHook } from "@/common/Reflection";

const data = reactive({
	active: false,
	ffz: null as FFZGlobalScope | null,
	overridesCreated: false,
	profile: {
		ephemeral: null as FFZSettingsProfile | null,
	},
});

definePropertyHook(window as Window & { ffz?: FFZGlobalScope }, "ffz", {
	value(v) {
		if (!v) return;

		data.active = true;
		data.ffz = v;

		patchFFZ();
	},
});

async function patchFFZ() {
	log.info("<FFZ-Compat>", "FrankerFaceZ detected—patching for compatibility. woof");

	try {
		const settings = resolveSettingsManager();

		if (!settings) throw new Error("FFZ settings module not fould");

		if (!settings.enabled) {
			await settings.waitFor(":enabled");
		}

		createOverrides();
		disableChatProcessing();
		createDummyAddon();
	} catch (e) {
		log.error("<FFZ-Compat>", "Error occured patching FrankerFaceZ:", (e as Error).message);
	}
}

function resolveSettingsManager(): FFZSettingsManager | null {
	if (!data.ffz) return null;

	const settings = data.ffz.resolve<FFZSettingsManager>("settings");
	if (!settings || typeof settings.get !== "function") return null;

	return toRaw(settings);
}

/**
 * Get a config value from FFZ
 */
function getConfig<T = unknown>(key: string): T | null {
	if (!data.ffz) return null;

	const settings = resolveSettingsManager();
	if (!settings) return null;

	return settings.get<T>(key) ?? null;
}

/**
 * Watch a config value from FFZ
 */
function getConfigChanges<T = unknown>(key: string, cb: (val: T) => void): void {
	if (!data.ffz) return;

	const settings = resolveSettingsManager();
	if (!settings) return;

	return settings.getChanges<T>(key, cb);
}

function disableChatProcessing() {
	if (!data.ffz) return;

	const settings = resolveSettingsManager();
	if (!settings) return null;

	settings.main_context.updateContext({ "disable-chat-processing": true });
	log.info("<FFZ-Compat>", "Disabled chat processing in FrankerFaceZ (╯°□°）╯︵ ┻━┻)");
}

function createOverrides(): void {
	if (!data.ffz || data.overridesCreated) return;

	const settings = resolveSettingsManager();
	if (!settings) return;

	const oldProfile = settings.__profiles.find((p) => p.name === "7TV");
	if (oldProfile) {
		settings.deleteProfile(oldProfile);
	}

	const profile = settings?.createProfile({
		name: "7TV",
		description:
			"This profile was generated by 7TV and modifies some settings for compatibility, but it has no effect if 7TV is not active.",
		context: [],
		hotkey: null,
		pause_updates: null,
		toggled: true,
		ephemeral: true,
	});

	if (!profile) {
		log.warn("<FFZ-Compat>", "Failed to set up FrankerFaceZ profile");
		return;
	}

	data.profile.ephemeral = profile;

	// Set up config toggles
	profile.set("toggled", true);
	profile.set("chat.scrollback-length", 1); // this prevents an issue with ffz's scroller delaying messages
	profile.set("chat.tab-complete.emoji", false); // this disables tab completion, as it clashes
	profile.set("chat.tab-complete.ffz-emotes", false);
	profile.set("chat.mru.enabled", false); // this disables history navigation, as it may clash
	profile.set("chat.emotes.enabled", false); // this disables emotes, as they serve zero purpose

	// Move profile to top
	if (typeof settings.moveProfile === "function") {
		settings.moveProfile(profile.id, 0);
	}

	log.info("<FFZ-Compat>", "Patched FrankerFaceZ settings");
	data.overridesCreated = true;
}

function setConfig<T>(profileName: keyof typeof data.profile, key: string, value: T) {
	const profile = data.profile[profileName];
	if (!data.ffz || !profile) return;

	profile.set(key, value);
}

function createDummyAddon() {
	if (!("FrankerFaceZ" in window)) return;

	class SeventvAddonOverride extends FrankerFaceZ.utilities.addon.Addon {}
	try {
		SeventvAddonOverride.register({
			id: "7tv-emotes",
			name: "7TV",
			author: "7TV",
			description:
				"The 7TV Extension is installed! We've patched some things to make sure it works well with FrankerFaceZ.",
			version: "0.0.0",
			website: "https://7tv.app",
			settings: "add_ons.7tv_emotes",
		});

		log.info("<FFZ-Compat>", "Disabled FrankerFaceZ Add-On for 7TV");
	} catch (e) {
		void 0;
	}
}

export function useFrankerFaceZ() {
	return reactive({
		active: data.active,
		getConfig,
		getConfigChanges,
		setConfig,
		disableChatProcessing,
	});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface FFZGlobalScope {
	resolve<T>(key: string): T;
	settings: FFZSettingsManager;
	addons: FFZAddonsManager;
}

export interface FFZModule {
	loading: boolean;
	loaded: boolean;
	enabling: boolean;
	enabled: boolean;
	disabling: boolean;
	disabled: boolean;
	state: number;

	on(event: string, callback: (...data: unknown[]) => void): void;
	off(event: string, callback: (...data: unknown[]) => void): void;
	waitFor(event: string): Promise<void>;
}

export interface FFZSettingsManager extends FFZModule {
	get<T = unknown>(key: string): T;
	getChanges<T = unknown>(key: string, cb: (val: T) => void): void;
	main_context: {
		updateContext(ctx: Record<string, unknown>): void;
	};

	createProfile: (e: {
		name: string;
		description: string;
		context: Record<string, unknown>[];
		hotkey: null;
		pause_updates: null;
		toggled: boolean;
		ephemeral: boolean;
	}) => FFZSettingsProfile;
	moveProfile: (p: number, pos: number) => void;
	deleteProfile: (profile: FFZSettingsProfile) => void;
	addFilter(
		p: string,
		v: {
			createTest: unknown;
			title?: string;
			default?: boolean;
			editor?: unknown;
		},
	): void;
	getFilterBasicEditor: () => unknown;
	__profiles: FFZSettingsProfile[];
}

export interface FFZSettingsProfile {
	description: string;
	enabled_key: string;
	i18n_key: string;
	id: number;
	name: string;
	toggled: boolean;
	ephemeral: boolean;

	set: (k: string, v: any) => void;
	get: <T = unknown>(k: string) => T;
	updateContext(ctx: Record<string, unknown>): void;
}

export interface FFZAddonsManager extends FFZModule {
	disableAddon: (id: string) => void;
	enableAddon: (id: string) => void;
	enabled_addons: string[];
}

declare const FrankerFaceZ: any;
