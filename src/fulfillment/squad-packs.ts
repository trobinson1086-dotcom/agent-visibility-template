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
const DEC = "/assets/squad-packs/2026-12";

export const BUILT_IN_PACKS: Readonly<Record<string, SquadPack>> = {
	"2026-11": {
		month: "2026-11",
		subject: "Your November Squish Squad Pack is here 🍂",
		heading: "Autumn in Maple Hollow",
		intro:
			"The leaves are falling in Maple Hollow, and Squish Man and Pudy made you seven autumn activity pages: Believe in Yourself, Trace the Alphabet, I'm Thankful For, the November Kindness Challenge, a Maple Hollow maze, Color by Number and a November word search. Plus autumn wallpapers for a grown-up's phone or tablet. Print the pack and have fun!",
		heroImage: `${NOV}/email-hero.jpg`,
		items: [
			{
				title: "November printable pack (7 pages, PDF)",
				description:
					"Believe in Yourself, Trace the Alphabet, I'm Thankful For…, November Kindness Challenge, Maple Hollow Maze, Color by Number, and a November Word Search.",
				url: `${NOV}/squish-squad-pack-november-2026.pdf`,
			},
			{ title: "Wallpaper: Squish Man & Pudy meet a butterfly", url: `${NOV}/wallpaper-bridge-butterfly.jpg` },
			{ title: "Wallpaper: Maple Hollow town square", url: `${NOV}/wallpaper-maple-hollow-square.jpg` },
			{ title: "Wallpaper: A flower for a friend", url: `${NOV}/wallpaper-bridge-flowers.jpg` },
		],
		published: true,
	},
	// From "Squish_Squad_decemeber _Member_Package_Complete.pdf" (Drive, "Squishman
	// subscription membership tier 1"). 6 printable pages this month: the owner
	// moved the full-color forest scene (page 6) to the wallpaper, and asked for
	// "January" on the last page to read "December".
	"2026-12": {
		month: "2026-12",
		subject: "Your December Squish Squad Pack is here ❄️",
		heading: "Big Dreams in Maple Hollow",
		intro:
			"Snow is falling in Maple Hollow, and Squish Man and Pudy made you six new pages: My Big Dreams for the New Year, the Squish Man Superhero Adventure and Be Kind coloring pages, the Park Path Adventure maze, All About Kindness activities and word search, and a Great Job certificate. Plus a cozy wallpaper for a grown-up's phone or tablet. Print the pack and have fun!",
		heroImage: `${DEC}/email-hero.jpg`,
		items: [
			{
				title: "December printable pack (6 pages, PDF)",
				description:
					"My Big Dreams for the New Year, Superhero Adventure coloring page, Be Kind coloring page, Park Path Adventure maze, All About Kindness activities, and a Great Job certificate.",
				url: `${DEC}/squish-squad-pack-december-2026.pdf`,
			},
			{ title: "Wallpaper: Squish Man & Pudy in the forest", url: `${DEC}/wallpaper-forest-friends.jpg` },
		],
		published: true,
	},
};
