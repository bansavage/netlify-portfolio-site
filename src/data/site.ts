// Every word on the site lives here. Pages and components only arrange it.

export const contact = {
  email: 'kyle@bansavage.dev',
  linkedin: 'https://www.linkedin.com/company/bansavage',
  github: 'https://github.com/bansavage-Inc/',
};

export const site = {
  title: 'Bansavage — Product engineering for the AI era',
  description:
    'Bansavage is a one-engineer product studio in Miami and New York: AI systems, web and iOS apps, websites, and Shopify commerce.',
  lead: 'Product engineering for the AI era.',
  leadMuted: 'I design, build, and ship AI systems, web and iOS apps, and commerce platforms.',
};

// The three claims under the homepage hero.
export const claims = [
  {
    title: 'I build products end to end.',
    text: 'Web apps, iOS apps, websites, and Shopify storefronts, taken from first sketch to production by the person who writes the code.',
  },
  {
    title: 'I know how to put AI to work.',
    text: 'Agents, automations, and LLM integrations wired into the tools and data a business already runs on, built for production use.',
  },
  {
    title: 'I work the way software gets built next.',
    text: 'One senior engineer with an AI-native workflow, shipping at the pace of a team. Fewer handoffs, shorter cycles, systems designed to change.',
  },
];

export const clients = [
  { name: 'Anastasia Beverly Hills', url: 'https://www.anastasiabeverlyhills.com/' },
  { name: 'AriZona Iced Tea', url: 'https://drinkarizona.com/' },
  { name: 'Pier1 Imports', url: 'https://www.pier1.com/' },
  { name: 'Veronica Beard', url: 'https://veronicabeard.com/' },
  { name: 'Frances Valentine', url: 'https://francesvalentine.com/' },
  { name: 'Hedley & Bennett', url: 'https://www.hedleyandbennett.com/' },
  { name: 'Paper Planes', url: 'https://www.paperplane.shop/' },
  { name: 'TWP', url: 'https://www.twpclothing.com/' },
  { name: 'AGCF', url: 'https://agcf.com/' },
  { name: 'Bogg Bag', url: 'https://boggbag.com/' },
  { name: 'Coniglio Palm Beach', url: 'https://www.conigliopalmbeach.com/' },
  { name: 'Greyson Clothiers', url: 'https://greysonclothiers.com/' },
  { name: 'Fleur du Mal', url: 'https://fleurdumal.com/' },
  { name: 'Mociun', url: 'https://mociun.com/' },
  { name: 'Whole Latte Love', url: 'https://www.wholelattelove.com/' },
  { name: 'Inbloom', url: 'https://www.tobeinbloom.com/' },
];

export type Row = { title: string; text: string };

export type ServiceSection = {
  title: string;
  id?: string;
  rows?: Row[];
  clients?: boolean;
};

export type Service = {
  slug: string;
  name: string;
  summary: string; // the one-sentence row on the homepage
  lead: string;
  leadMuted: string;
  workHref?: string; // where "See the work" points; omitted when the page has no work section
  sections: ServiceSection[];
};

const rows = (pairs: [string, string][]): Row[] => pairs.map(([title, text]) => ({ title, text }));

// DRAFT: service page copy, written for Kyle to review. The "Track record" and
// "Recent work" figures come from the old site's hidden work notes and the AI work
// Kyle described; nothing in them is invented, but check each line before launch.
export const services: Service[] = [
  {
    slug: 'ai-solutions',
    name: 'AI Solutions',
    summary: 'Agents, automations, and LLM integrations that take manual work off a team.',
    lead: 'AI that does real work inside the tools a business already runs on.',
    leadMuted: 'Agents, automations, and LLM integrations, built for production use.',
    workHref: '#work',
    sections: [
      {
        title: 'What I build',
        rows: rows([
          ['Agents', 'Assistants that read email, documents, and spreadsheets, then take the next step.'],
          ['Workflow automation', 'Back-office routines, like turning orders into invoices, handled end to end.'],
          ['LLM integrations', 'Language models connected to your CRM, accounting, and internal tools.'],
          ['Data extraction', 'Emails, PDFs, and forms turned into clean records your systems can use.'],
          ['Private assistants', 'Internal tools that answer questions from your own documents and data.'],
        ]),
      },
      {
        title: 'Recent work',
        id: 'work',
        rows: rows([
          ['Email to invoice', 'Customer emails read and entered as QuickBooks invoices, with no one retyping them.'],
          ['Spreadsheet upkeep', 'Routine Excel edits made on request, so the numbers stay current without manual entry.'],
        ]),
      },
      {
        title: 'How I work',
        rows: rows([
          ['Start with the hours', 'I find the tasks that eat the most time and map how they get done today.'],
          ['Build on real data', 'Prototypes run on your actual email, files, and systems, not a demo.'],
          ['Keep people in charge', 'Anything that sends, pays, or changes a record waits for approval until it has earned trust.'],
          ['Run it like software', 'Logging, error handling, and monitoring ship with it, so it keeps working after launch.'],
        ]),
      },
    ],
  },
  {
    slug: 'web-applications',
    name: 'Web Applications',
    summary: 'Customer portals, dashboards, and internal tools, from first prototype to production.',
    lead: 'Software your customers and team use every day.',
    leadMuted: 'Customer portals, dashboards, and internal tools, from first prototype to production.',
    workHref: '#work',
    sections: [
      {
        title: 'What I build',
        rows: rows([
          ['Customer portals', 'Accounts, orders, subscriptions, and billing your customers manage themselves.'],
          ['Dashboards', 'Live views of the numbers that run the business, drawn from the systems you already use.'],
          ['Internal tools', 'Admin panels and workflows that replace spreadsheets and copy and paste.'],
          ['APIs and integrations', 'REST and GraphQL APIs that connect your apps, data, and vendors.'],
          ['Accounts and sign-in', 'Secure authentication, passwordless included, with roles and permissions.'],
        ]),
      },
      {
        title: 'Track record',
        id: 'work',
        rows: rows([
          ['Passwordless sign-in', 'Node.js microservices and subscription APIs that raised customer lifetime value 30% and cut support requests 40%.'],
          ['Order operations', 'Node.js services for risk screening, fulfillment, and shipping labels that handle 200+ orders a day and doubled label throughput.'],
        ]),
      },
      {
        title: 'How I work',
        rows: rows([
          ['Prototype first', 'You use a working version early, before the big decisions are locked in.'],
          ['Production from day one', 'Typed code, automated tests, and CI/CD from the first commit.'],
          ['Built to change', 'Clear architecture and documentation, so the app grows without a rewrite.'],
          ['One point of contact', 'The person you talk to is the person writing the code.'],
        ]),
      },
    ],
  },
  {
    slug: 'ios-apps',
    name: 'iOS Apps',
    summary: 'Native iPhone apps, designed, built, and shipped to the App Store.',
    lead: 'Native iPhone apps that feel at home on the device.',
    leadMuted: 'Designed, built, and shipped to the App Store.',
    sections: [
      {
        title: 'What I build',
        rows: rows([
          ['Customer apps', 'Polished iPhone apps for your customers, written in Swift and SwiftUI.'],
          ['Companion apps', 'Apps that extend a web product, store, or service your customers already use.'],
          ['Internal apps', 'Tools for your team, distributed privately or through the App Store.'],
          ['AI features', 'Assistants, smart search, and automation built into the app.'],
          ['Backends', 'The APIs, accounts, and push notifications the app runs on.'],
        ]),
      },
      {
        title: 'How I work',
        rows: rows([
          ['Prototype on a real phone', 'You hold a working build early, so decisions come from use, not screenshots.'],
          ['Native first', 'Swift and Apple’s own frameworks, for apps that are fast, accessible, and stable.'],
          ['Beta before launch', 'Your team and early customers test through TestFlight before anything goes public.'],
          ['App Store, handled', 'Submission, review, and release, through launch and every update after.'],
        ]),
      },
    ],
  },
  {
    slug: 'custom-websites',
    name: 'Custom Websites',
    summary: 'Fast, hand-built brand and marketing sites.',
    lead: 'Brand and marketing sites, built by hand and built to be fast.',
    leadMuted: 'Written for your site alone, not adapted from a template.',
    sections: [
      {
        title: 'What I build',
        rows: rows([
          ['Brand sites', 'A site that carries the brand, down to the type, motion, and detail.'],
          ['Marketing sites', 'Landing pages and campaigns your team can update without a developer.'],
          ['Site speed', 'Pages that load fast and pass Core Web Vitals.'],
          ['Launch and hosting', 'Domains, hosting, analytics, and redirects, set up and handled.'],
        ]),
      },
      {
        title: 'How I work',
        rows: rows([
          ['Built by hand', 'Every page is written for your site, so there is nothing to work around.'],
          ['Speed as a feature', 'A performance budget is set at the start and checked before every launch.'],
          ['Search-ready', 'Clean markup, metadata, and accessibility from the first page.'],
          ['Yours to run', 'Your team edits the content, and you own the code.'],
        ]),
      },
    ],
  },
  {
    slug: 'shopify-commerce',
    name: 'Shopify & Commerce',
    summary: 'Shopify Plus storefronts, checkout, subscriptions, and loyalty for brands that have outgrown their theme.',
    lead: 'Shopify Plus storefronts, checkout, subscriptions, and loyalty.',
    leadMuted: 'For brands that have outgrown their theme.',
    workHref: '#work',
    sections: [
      {
        title: 'What I build',
        rows: rows([
          ['Custom storefronts', 'Shopify Plus themes and headless builds, designed around the brand.'],
          ['Checkout', 'Checkout extensions and Shopify Functions for discounts, shipping, and payments.'],
          ['Subscriptions', 'Recurring orders and memberships customers can manage themselves.'],
          ['Loyalty and membership', 'Programs that reward repeat customers and raise lifetime value.'],
          ['Apps and integrations', 'Third-party apps and custom integrations, tuned so they never slow the store.'],
          ['Site speed', 'Faster storefronts that convert more of the traffic you already pay for.'],
        ]),
      },
      {
        title: 'Track record',
        rows: rows([
          ['A shared storefront framework', 'Built in Vue, Vite, and GraphQL and adopted across 10+ storefronts, it cut build time 25% and lifted conversion 35%.'],
          ['From 3 to 30 engineers', 'CI/CD, coding standards, and Agile practice that contributed to $1M in first-year revenue, Shopify Plus Partner status, and an acquisition by Revyrie Global.'],
          ['Catalog sync', 'A Node.js integration that keeps 4,000+ products in step between Contentful and Shopify, with no manual entry.'],
        ]),
      },
      {
        title: 'Brands I’ve built for',
        id: 'work',
        clients: true,
      },
    ],
  },
];
