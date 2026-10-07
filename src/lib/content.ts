/**
 * Source content for squishman.com, taken from the live site (public/).
 * Every agent surface (llms.txt, /index.json, /<slug>.md, JSON-LD) is
 * rendered from these entries after Workers AI enrichment.
 *
 * When the site copy changes, update the matching entry here (or POST it to
 * /api/resources) and hit POST /api/refresh so the surfaces re-enrich.
 */
import type { RawResource } from "./types";

const SITE = "https://squishman.com";

export const SAMPLE_RESOURCES: RawResource[] = [
	{
		slug: "about",
		url: `${SITE}/`,
		title: "The Amazing Adventures of Squish Man™",
		body: `# The Amazing Adventures of Squish Man™

Big Heart. Tiny Hero. Endless Adventures!

Welcome to Maple Hollow. Step into a colorful world where Squish Man and his
best friend Pudy turn everyday challenges into adventures filled with kindness,
courage, creativity and heart.

- Reading level: K–4 / ages 5–9
- Positive character lessons
- Learning + creativity
- English + Español

## Maple Hollow
Maple Hollow is more than a setting — it is the heart of the Squish Man
universe. Every adventure gives young readers a chance to explore friendship,
confidence, teamwork, responsibility and creative problem-solving through
colorful stories made for families to enjoy together.

## Meet the heroes
Squish Man™ — a tiny cream-white Chihuahua with a royal-blue cape, a gold crown
and enough heart to tackle even the biggest problem.

Pudy — Squish Man's bigger, older best friend. Loyal, brave and always ready to
join the next Maple Hollow adventure.

SquishMan.com · © 2026 Travis Robinson.`,
	},
	{
		slug: "books",
		url: `${SITE}/#books`,
		title: "The Squish Man Book Series",
		prices:
			"Paperback $19.99 • Hardcover $29.99 • eBook $9.99 • Audiobook $14.99",
		body: `# The Squish Man Book Series

Original English adventures. Paperback $19.99 • Hardcover $29.99 • eBook $9.99 • Audiobook $14.99.
Each book has a product page with real "Look Inside" interior preview pages.

## Book 1 — Squish Man and the Missing Puppy Parade
Theme: Kindness & Courage. A Maple Hollow mystery-adventure where tiny hero
Squish Man follows clues and helps bring the community together. The story
centers on friendship, communication and helping others.

## Book 2 — Squish Man's Big Dream Adventure
Theme: Believe in Yourself. Squish Man dreams of doing something big, then
learns that being small does not limit how far courage, persistence and belief
can take him.

## Book 3 — Squish Man and the Magical Garden
Theme: Patience & Caring. Squish Man discovers a magical garden and learns that
wonderful things cannot always be rushed. With Ruby, Pip and new friends, he
discovers the value of patience and steady care.

## Book 4 — Squish Man Saves the Snow Day
Theme: Creativity & Teamwork. A huge snowfall turns Squish Man's perfect snow
day into a challenge. When one tiny hero cannot solve everything alone, Maple
Hollow discovers what creativity and teamwork can do.

## Book 5 — Squish Man and Pudy and the Great Maple Hollow Derby
Theme: Be Yourself. Squish Man and Pudy join the Great Maple Hollow Derby, where
racing becomes a celebration of friendship, teamwork and finding your own way
to shine.`,
	},
	{
		slug: "learning-and-activity-books",
		url: `${SITE}/#learning`,
		title: "Learning, Activity, Bonus & Coloring Books",
		prices:
			"Learning & Activity Books $19.99 • Bonus Activities & Learning Editions $39.99 • Coloring Books $18.99",
		body: `# Learning, Activity, Bonus & Coloring Books

## Learning & Activity Books 1–5 — $19.99 each
Practice early skills with puzzles, mazes, letters, numbers, reading,
creativity and more, alongside familiar Maple Hollow characters.

## Bonus Activities & Learning Editions 1–5 — $39.99 each
More story, more learning: expanded editions of each adventure with activities.

## Coloring Books 1–5 — $18.99 each
Screen-free creative fun with familiar Maple Hollow characters and scenes.

## Complete collections
- English Learning Set: Learning & Activity Books 1–5 together.
- Colección en Español: Libros de Aprendizaje y Actividades 1–5.
- Bilingual Mega Bundle: all 10 English + Spanish Learning & Activity Books.`,
	},
	{
		slug: "espanol",
		url: `${SITE}/#spanish`,
		title: "Squish Man en Español",
		prices:
			"Libros 1–5: Paperback $19.99 • Hardcover $29.99 • Edición Especial $39.99 • Aprendizaje y Actividades $19.99",
		body: `# Squish Man en Español — Aventuras en Español

Storybooks, special editions and learning & activity books for Spanish-reading
families. Libros 1–5: Paperback $19.99 • Hardcover $29.99. Edición Especial
$39.99 • Aprendizaje y Actividades $19.99.

## Libros 1–5 — Paperback $19.99 • Hardcover $29.99
1. Squish Man y el Desfile del Cachorro Perdido
2. La Gran Aventura del Gran Sueño
3. Squish Man y el Jardín Mágico
4. Squish Man Salva el Día de Nieve
5. Squish Man y Pudy y el Gran Derby de Maple Hollow

## Edición Especial 1–5 — $39.99 each
Special activity & learning editions of each Spanish storybook.

## Aprendizaje y Actividades 1–5 — $19.99 each
Spanish learning & activity books.`,
	},
	{
		slug: "parents-and-teachers",
		url: `${SITE}/#families`,
		title: "Parents & Teachers Resource Center",
		body: `# Parents & Teachers Resource Center

Turn each Squish Man adventure into a read-aloud, discussion, reflection or
classroom activity. The series supports conversations about kindness, courage,
confidence, persistence, patience, creativity, teamwork and being yourself.

- Read-aloud ready: shared reading, morning meetings, library story time.
- Discussion prompts: what Squish Man tried, how characters felt, what changed.
- Reflect & create: drawing, writing, coloring and the learning editions.
- English + Español collections for multilingual communities.

## Lesson ideas
- Book 1 • Kindness & Helping — Ask: "What is one kind thing you can do for someone today?"
- Book 2 • Believe in Yourself — Draw a big dream and write one small step toward it.
- Book 3 • Patience & Caring — Name something that gets better when we care for it patiently.
- Book 4 • Creativity & Teamwork — Give a group one problem; each child contributes a solution.
- Book 5 • Friendship & Being Yourself — Ask: "What is something you do in your own special way?"

## Schools, libraries & programs
Ask about school or bulk orders, educator resources and author/media events.
Schools: schools@squishman.com • Parents: parents@squishman.com • Media: media@squishman.com`,
	},
	{
		slug: "watch",
		url: `${SITE}/#watch`,
		title: "Maple Hollow Entertainment Center",
		prices: "Audiobook editions of Books 1–5: $14.99",
		body: `# The Maple Hollow Entertainment Center

Watch • Listen • Read Along. A home for Squish Man cartoons, book trailers,
read-alouds and audiobook samples.

- Official video: "Watch Squish Man Come to Life" — Squish Man and Pudy in the
  official SquishMan.com featured video.
- Mini cartoons, read-alouds and book trailers: coming soon.
- Audiobook editions of Books 1–5 are $14.99 where offered.`,
	},
	{
		slug: "squish-squad",
		url: `${SITE}/#squish-squad`,
		title: "Join the Squish Squad",
		body: `# Join the Squish Squad — It's Free!

A free parent-and-guardian signup hub for Maple Hollow news, free activities,
kindness challenges and new-adventure announcements. Children are never asked
to submit personal information.

- Free kids activities: coloring, puzzles, drawing prompts.
- Small Paws, Big Difference: kindness challenges inspired by Squish Man.
- Birthday Club: parent-requested printables and celebration activities.
- New Adventure Alerts: upcoming books, audiobooks, videos and releases.

Maple Hollow Kindness Challenge missions: help without being asked, say
something encouraging, include someone, care for something living, keep trying
when something is hard.

Sign up with a parent or guardian email at squishfans@squishman.com.`,
	},
	{
		slug: "faq",
		url: `${SITE}/#faq`,
		title: "Frequently Asked Questions",
		body: `# FAQ

What ages are Squish Man books for? The series is designed primarily for K–4
readers, approximately ages 5–9.

Are books available in Spanish? Yes — Spanish storybooks, special editions and
Spanish learning/activity editions.

Can I preview a book before buying? Yes. Books 1–5 include real Look Inside
sample pages taken from the approved interiors.

Do you offer school or bulk orders? Schools, libraries and programs can contact
schools@squishman.com.

Where can I get order help? orders@squishman.com for order questions or
support@squishman.com for customer support.`,
	},
	{
		slug: "contact",
		url: `${SITE}/#contact`,
		title: "Contact Squish Man™",
		body: `# Contact

- General questions: contact@squishman.com
- Customer support: support@squishman.com
- Orders & purchases: orders@squishman.com
- Schools & teachers: schools@squishman.com
- Squish Squad fan club: squishfans@squishman.com
- Parents & families: parents@squishman.com
- Comments & feedback: comments@squishman.com
- Say hello: hello@squishman.com
- Media & press: media@squishman.com`,
	},
	{
		slug: "policies",
		url: `${SITE}/privacy.html`,
		title: "Privacy, Terms, Shipping & Returns",
		body: `# Policies

## Privacy
SquishMan.com may receive information you choose to provide through purchases,
contact forms or newsletter signup; payments are processed by the payment
provider, not stored by the site. Purchases and signups are intended for
parents, guardians, teachers and other adults — the site does not knowingly
solicit personal information from children.

## Terms
Availability, formats, pricing and descriptions may change; final totals,
taxes and shipping are shown at checkout. Squish Man™, The Amazing Adventures
of Squish Man™, its characters, artwork and branding are protected
intellectual property.

## Shipping & returns
Shipping rates and delivery estimates are shown at checkout. eBooks and
digital products are delivered electronically after payment. For returns or
damaged orders, email contact@squishman.com with your order information.`,
	},
];
