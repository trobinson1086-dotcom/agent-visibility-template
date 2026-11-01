/**
 * Squish Squad Packs shipped with the site. A pack saved through the admin API
 * (`PUT /api/admin/squad/packs/YYYY-MM`) replaces the built-in one for that
 * month. Paths starting with "/" are served from public/ on squishman.com.
 *
 * Owner's rule for every month from December 2026 on (see AGENTS.md): exactly
 * 7 printable pages, made only from illustrations and pages in the Squish Man
 * Google Drive folders.
 */
import type { SquadPack } from "./email";

const NOV = "/assets/squad-packs/2026-11";

export const BUILT_IN_PACKS: Readonly<Record<string, SquadPack>> = {
	"2026-11": {
		month: "2026-11",
		subject: "Your November Squish Squad Pack is here 🍂",
		heading: "Autumn in Maple Hollow",
		intro:
			"The leaves are falling in Maple Hollow, and Squish Man and Pudy made you something special: pages to color, trace and stick, a leaf maze, a Thanksgiving \"I'm Thankful For\" page, a November Kindness Challenge, autumn bookmarks, and wallpapers for a grown-up's phone or tablet. Print the pack and have fun!",
		heroImage: `${NOV}/email-hero.jpg`,
		items: [
			{
				title: "November printable pack (10 pages, PDF)",
				description:
					"3 coloring pages, Trace the Alphabet, I'm Thankful For…, the November Kindness Challenge, a Help Squish Man Find Pudy maze, a sticker sheet, autumn bookmarks, and a sneak peek from Bonus Edition 3.",
				url: `${NOV}/squish-squad-pack-november-2026.pdf`,
			},
			{ title: "Wallpaper: Squish Man & Pudy meet a butterfly", url: `${NOV}/wallpaper-bridge-butterfly.jpg` },
			{ title: "Wallpaper: Maple Hollow town square", url: `${NOV}/wallpaper-maple-hollow-square.jpg` },
			{ title: "Wallpaper: A flower for a friend", url: `${NOV}/wallpaper-bridge-flowers.jpg` },
		],
		published: true,
	},
};
