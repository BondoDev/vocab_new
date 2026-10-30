// Which 100-most-common-nouns lists are released for indexing, by listId
// (see src/data/seo/listPages/nounLists/common100Nouns/common100NounEntries.ts).
// A list's pages are indexable only when it is listed here AND its dataset
// has all expectedWordCount rows — so a list still holding placeholder rows
// can never be indexed as a finished "100 words" page, even if added here
// early. Until then its pages serve "noindex, follow" and stay out of the
// sitemap and the Learning Resources links.
export const LAUNCHED_NOUN_LISTS: ReadonlySet<string> = new Set<string>([]);

export const NOUN_LIST_PRELAUNCH_ROBOTS = "noindex, follow";
