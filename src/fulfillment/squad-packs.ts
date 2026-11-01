/**
 * Squish Squad Packs shipped with the site. A pack saved through the admin API
 * (`PUT /api/admin/squad/packs/YYYY-MM`) replaces the built-in one for that
 * month. Paths starting with "/" are served from public/ on squishman.com.
 */
import type { SquadPack } from "./email";

const NOV = "/assets/squad-packs/2026-11";

export const BUILT_IN_PACKS: Readonly<Record<string, SquadPack>> = {
	"2026-11": {
		month: "2026-11",
		subject: "Your November Squish Squad Pack is here 🍂",
		heading: "Autumn in Maple Hollow",
		intro:
			"The leaves are falling in Maple Hollow, and Squish Man and Pudy made you something special: ten pages to color, trace, count, solve and stick, plus autumn wallpapers for a grown-up's phone or tablet. Print the pack and have fun!",
		heroImage: `${NOV}/email-hero.jpg`,
		items: [
			{
				title: "November printable pack (10 pages, PDF)",
				description:
					"3 coloring pages, Color with Squish Man, Trace the Alphabet, Match & Maze activities, Count & Add math, Find Squish Man, and two sticker pages.",
				url: `${NOV}/squish-squad-pack-november-2026.pdf`,
			},
			{ title: "Wallpaper: Squish Man & Pudy meet a butterfly", url: `${NOV}/wallpaper-bridge-butterfly.jpg` },
			{ title: "Wallpaper: Maple Hollow town square", url: `${NOV}/wallpaper-maple-hollow-square.jpg` },
			{ title: "Wallpaper: A flower for a friend", url: `${NOV}/wallpaper-bridge-flowers.jpg` },
		],
		published: true,
	},
};
