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
const JAN = "/assets/squad-packs/2027-01";

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
	// From "Squish_Squad_Pal_December_2026_Complete_Monthly_Package.pdf" (Drive,
	// "Squishman subscription membership tier 1"), 6 pages as the owner made it.
	// The "THE AMAZING ADVENTURES OF" ribbon text on pages 1 and 5 was misspelled
	// in the source art and is redrawn.
	"2026-12": {
		month: "2026-12",
		subject: "Your December Squish Squad Pack is here ❄️",
		heading: "December Fun in Maple Hollow",
		intro:
			"Snow is falling in Maple Hollow, and Squish Man and Pudy made you six new pages: your own Squish Squad Member page, the Friends Make Life Brighter coloring page, the Park Path Adventure maze, math practice, the December Kindness Challenge and a Great Job certificate. Print the pack and have fun!",
		heroImage: `${DEC}/email-hero.jpg`,
		items: [
			{
				title: "December printable pack (6 pages, PDF)",
				description:
					"I'm a Squish Squad Member!, Friends Make Life Brighter coloring page, Park Path Adventure maze, math practice, December Kindness Challenge, and a Great Job certificate.",
				url: `${DEC}/squish-squad-pack-december-2026.pdf`,
			},
		],
		published: true,
	},
	// From the New Year package in the tier 1 Drive folder (file titled
	// "Squish_Squad_decemeber _Member_Package_Complete.pdf", whose pages say
	// January). The owner dropped its Park Path maze (already in December) and
	// made the full-color forest scene the wallpaper: 5 printable pages.
	"2027-01": {
		month: "2027-01",
		subject: "Your January Squish Squad Pack is here ✨",
		heading: "Big Dreams for the New Year",
		intro:
			"Happy New Year from Maple Hollow! Squish Man and Pudy made you five new pages: My Big Dreams for the New Year, the Squish Man Superhero Adventure and Be Kind coloring pages, All About Kindness activities and word search, and a Great Job certificate. Plus a cozy wallpaper for a grown-up's phone or tablet. Print the pack and have fun!",
		heroImage: `${JAN}/email-hero.jpg`,
		items: [
			{
				title: "January printable pack (5 pages, PDF)",
				description:
					"My Big Dreams for the New Year, Superhero Adventure coloring page, Be Kind coloring page, All About Kindness activities, and a Great Job certificate.",
				url: `${JAN}/squish-squad-pack-january-2027.pdf`,
			},
			{ title: "Wallpaper: Squish Man & Pudy in the forest", url: `${JAN}/wallpaper-forest-friends.jpg` },
		],
		published: true,
	},
};
