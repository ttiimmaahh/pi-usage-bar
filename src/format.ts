const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export function stripAnsi(text: string): string {
	return text.replace(ANSI_PATTERN, "");
}

export function formatTokens(value: number): string {
	if (!Number.isFinite(value)) return "0";
	const absolute = Math.abs(value);
	if (absolute >= 1_000_000) {
		const millions = value / 1_000_000;
		return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}M`;
	}
	if (absolute >= 1_000) {
		const thousands = value / 1_000;
		return `${thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
	}
	return `${Math.round(value)}`;
}

export function formatMoney(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "$0.00";
	if (value < 0.01) return `$${value.toFixed(4)}`;
	if (value < 10) return `$${value.toFixed(2)}`;
	return `$${value.toFixed(0)}`;
}

export function formatModelName(id: string | undefined): string {
	if (!id) return "no-model";
	const base = id.includes("/") ? (id.split("/").pop() ?? id) : id;
	return base.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

export function progressBar(
	percent: number | null | undefined,
	width = 10,
): string {
	if (percent === null || percent === undefined || !Number.isFinite(percent)) {
		return "░".repeat(width);
	}
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

export function truncatePlain(text: string, max: number): string {
	const chars = Array.from(text);
	if (chars.length <= max) return text;
	if (max <= 1) return "…";
	return `${chars.slice(0, max - 1).join("")}…`;
}
