// src/lib/legalContent.ts
//
// The text of Akọ's Privacy Policy and Terms of Service. Mirrored from the web app (meckurypro/ako,
// src/lib/legalContent.ts), which is the source of truth — change both together and bump LEGAL_UPDATED.
//
// Shape: each section is a title plus `blocks`. A string block is a paragraph; a string[] block is a bullet list.
// Section order is the display order and the numbering.

export type LegalBlock = string | string[];

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/** Shown at the top of both documents. Bump when either document changes in a way users should know about. */
export const LEGAL_UPDATED = "October 23, 2026";

/** Where people reach us about privacy requests, account deletion and legal notices. Change it here only. */
export const LEGAL_CONTACT_EMAIL = "support@myako.site";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  intro:
    "Akọ is a pan-African platform for people who learn and people who influence. This policy explains what we collect when you use Akọ on the web (myako.site) or in our mobile app, why we collect it, who we share it with, and the choices you have. We have tried to write it plainly. If something here is unclear, write to us.",
  sections: [
    {
      id: "what-we-collect",
      title: "Information we collect",
      blocks: [
        "We collect only what we need to run Akọ. It falls into these groups:",
        [
          "Account details: your display name, username, email address and password (or your Google account details if you sign in with Google). Passwords are handled by our authentication provider and are never visible to us in readable form.",
          "Profile details: your photo, bio, website links, roles, and the topics and interests you pick during onboarding.",
          "Content you create: posts, comments, stances and reactions, projects (files, books, courses, events, rooms, meetings, gigs, music and links), uploads, Pages you create or help run, and anything you submit when you report, review or apply.",
          "Messages and calls: the messages, voice notes, photos, files and links you send in chats, and the metadata around them such as who you wrote to and when. Live meetings and rooms use real-time audio and video; recordings only exist when a host records a session.",
          "Wallet and payments: deposits you make, gifts you send or receive, purchases, earnings, affiliate commissions, promotion charges and refunds, and withdrawal requests. When you add a payout account we collect your bank name, account number and the account name returned by our payment provider. We do not see or store your card details; those go directly to our payment provider.",
          "Activity on Akọ: who you follow, what you view, like, save, share, reshare, gift or buy, the profiles you visit, your search and viewing history, and your reading and course progress. This is what makes your feed, library and recommendations work.",
          "Device and technical data: your device type, app version, language, time zone, IP address, a device identifier, push notification token, and error and security logs.",
        ],
        "Akọ does not read your phone contacts. Connections you see in Discover come from what you do on Akọ, such as following, messaging, joining the same room, collaborating or buying the same project.",
      ],
    },
    {
      id: "permissions",
      title: "Device permissions",
      blocks: [
        "The mobile app asks for permission only when you use a feature that needs it, and you can change these in your phone settings at any time:",
        [
          "Camera: to scan event tickets at the door and to take photos you send in chats.",
          "Microphone: to record voice messages and to speak in live meetings and rooms.",
          "Photos and videos: to choose media for posts, chats and projects.",
          "Calendar: to add events and meetings you choose to your own calendar. We do not read your calendar.",
          "Notifications: to alert you to messages, gifts, purchases and activity.",
        ],
      ],
    },
    {
      id: "how-we-use",
      title: "How we use your information",
      blocks: [
        [
          "To provide Akọ: create and secure your account, show your profile and content, deliver messages, run projects, events, rooms and meetings, and process payments, gifts and withdrawals.",
          "To personalise your experience: rank your feed using your interests, who you follow, how people engage with each post, and who in your network engaged with it, and to suggest people, topics and projects.",
          "To keep Akọ safe: new posts and comments pass through automated moderation before they appear, reports are reviewed by our team, and we detect spam, fraud, reward farming and abuse. Where an account needs review, we may restrict what it can do while we check.",
          "To communicate with you: verification emails, security notices, receipts, push notifications and notices about changes to Akọ. You can switch off most notifications in Settings.",
          "To improve Akọ: understand which features work, fix bugs and plan new ones, mostly from aggregated usage data.",
          "To meet legal obligations: keep financial records, respond to lawful requests and enforce our Terms.",
        ],
      ],
    },
    {
      id: "messages",
      title: "Your private messages",
      blocks: [
        "Chats are protected in transit using encryption (HTTPS/TLS) and are stored behind access controls so that other users cannot read conversations they are not part of. At this time, Akọ chats are not end-to-end encrypted, which means our systems can technically access message content. We do not read private messages as a matter of routine. We may look at specific messages only when someone reports them, when needed to investigate abuse or security incidents, or when the law requires it.",
        "If we introduce end-to-end encryption in future, we will update this policy and tell you.",
      ],
    },
    {
      id: "sharing",
      title: "Who we share information with",
      blocks: [
        "We do not sell your personal information. We share it only in these ways:",
        [
          "With other people on Akọ, according to what you post and your privacy settings. Public profiles and posts are visible to anyone, including people who are not signed in. Hosts and creators can see limited details of people who join, buy or check in to their events, rooms, meetings and projects, so they can deliver them.",
          "With service providers who run parts of Akọ for us under contract: our backend, database, storage and authentication provider (Supabase); our payment and payout provider (Paystack); our live audio and video provider (LiveKit); push notification services (Expo, Google Firebase Cloud Messaging and Apple Push Notification service); and Google if you choose to sign in with Google. They may only use your information to provide their service to us.",
          "With advertisers and promoters, only as aggregated results such as reach and engagement for a promotion. We do not give them your personal details.",
          "With authorities or other parties when we believe in good faith that the law requires it, or to protect the safety, rights or property of our users, the public or Akọ.",
          "In a merger, acquisition or sale of Akọ, in which case your information may transfer to the new owner under this policy or a policy at least as protective.",
        ],
        "Some of these providers process data outside Nigeria. Where that happens we rely on contractual and technical safeguards to protect it.",
      ],
    },
    {
      id: "google-sign-in",
      title: "Google sign-in and Google user data",
      blocks: [
        "You can create an account or log in with Google. This section explains exactly what we receive from Google and what we do with it.",
        [
          "What we receive: when you choose to continue with Google, Google shares your name, your email address and your Google profile picture with our authentication provider (Supabase), using the standard openid, email and profile permissions. We do not ask for, and cannot see, anything else in your Google account, such as your Gmail, Google Drive, Calendar, Contacts, search history or YouTube data.",
          "How we use it: we use your email address to create and secure your Akọ account and to send you account and security messages, and we use your name to suggest a display name when you set up your profile. We do not currently use your Google profile picture; the photo on your Akọ profile is only one you choose to upload.",
          "How we store it: your email address and name are stored with your other account details in our authentication provider and our database, and protected as described in this policy.",
          "Who we share it with: we do not sell it, we do not use it for advertising, and we do not share it with anyone except the service providers that run Akọ for us (listed above) or where the law requires it.",
          "Your choices: you can stop Akọ from using Google sign-in at any time by removing Akọ from the apps connected to your Google Account (myaccount.google.com/permissions). You can also ask us to delete your account information by emailing the address in Contact us.",
        ],
        "Akọ's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.",
      ],
    },
    {
      id: "controls",
      title: "Your choices and controls",
      blocks: [
        [
          "Private account: only your followers can see your posts.",
          "Hide your followers list and your following list.",
          "Block or mute accounts.",
          "Edit your profile, change your password, and control notification and sound settings in Settings.",
          "Revoke camera, microphone, photo, calendar and notification access in your device settings.",
          "Deactivate your account from Settings > Advanced. This signs you out everywhere and hides your profile and posts.",
        ],
      ],
    },
    {
      id: "retention",
      title: "How long we keep information",
      blocks: [
        "We keep your information while your account is active and for as long as needed to provide Akọ. If you deactivate your account, your profile and posts are hidden, but we keep your wallet and transaction history for financial record-keeping, fraud prevention and legal compliance. Some records, such as purchases, music licence acceptances and assignment submissions, are kept so that other people's accounts and records stay accurate.",
        "To ask us to delete your personal information, email us at the address below. We will delete or anonymise what we are not required to keep, and tell you what we kept and why. Copies in backups are removed on their normal cycle.",
      ],
    },
    {
      id: "security",
      title: "How we protect your information",
      blocks: [
        "Data is encrypted in transit and our infrastructure providers encrypt stored data. Access to data in our database is restricted by row-level security rules, and sensitive operations such as payments, withdrawals and moderation run on the server rather than in your app. On the mobile app, your sign-in session and offline cache are stored in encrypted storage on your device. No system is perfectly secure, so please use a strong, unique password and tell us straight away if you suspect your account has been accessed by someone else.",
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      blocks: [
        "Under the Nigeria Data Protection Act 2023 and similar laws that may apply to you, you can ask to access the personal information we hold about you, correct it, delete it, restrict or object to how we use it, receive a copy of it, or withdraw consent you have given. Email us to make a request. We may need to confirm it is really you, and we will answer within the time the law allows. If you are unhappy with our response, you may complain to the Nigeria Data Protection Commission or your local data protection authority.",
      ],
    },
    {
      id: "age",
      title: "Age requirements",
      blocks: [
        "Akọ is not for children. You must be at least 16 to create an account. Payments, purchases and withdrawals require you to be old enough to enter a binding contract where you live. If we learn that someone under the minimum age has an account, we will remove it. If you believe a child is using Akọ, please contact us.",
      ],
    },
    {
      id: "changes",
      title: "Changes to this policy",
      blocks: [
        "We may update this policy as Akọ grows. When we make a significant change we will tell you in the app or by email before it takes effect. The date at the top shows when it was last updated.",
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      blocks: [
        `For questions, privacy requests or deletion requests, email ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  intro:
    "These terms are the agreement between you and Akọ when you use our website (myako.site) and mobile app. Please read them. By creating an account or using Akọ you agree to them and to our Privacy Policy. If you do not agree, please do not use Akọ.",
  sections: [
    {
      id: "about",
      title: "About Akọ",
      blocks: [
        "Akọ is a social and creator platform where people share ideas, follow each other, message, and offer or buy projects such as files, books, courses, events, rooms, meetings, gigs, music and links. We provide the platform. People who post content or sell projects are responsible for what they offer, and unless a feature says otherwise, Akọ is not a party to the agreement between a creator and the people who buy from or work with them.",
      ],
    },
    {
      id: "accounts",
      title: "Your account",
      blocks: [
        [
          "You must be at least 16, and old enough to make a binding contract to buy, sell or withdraw money.",
          "Give accurate information and keep it up to date. Personal accounts are for one real person. Pages are for brands, organisations and teams, and the people you give roles to act for that Page.",
          "Keep your password secure. You are responsible for activity on your account, so tell us immediately if someone else has used it.",
          "We may review, restrict or decline accounts to keep Akọ safe, for example where we suspect fraud, impersonation or abuse. Some features, such as creating certain projects or withdrawing money, may depend on your account's status.",
        ],
      ],
    },
    {
      id: "your-content",
      title: "Your content",
      blocks: [
        "You own what you create and post on Akọ. You give us a worldwide, non-exclusive, royalty-free licence to host, store, display, reproduce, adapt for formatting, and distribute your content on and through Akọ (including in previews and when others share, reshare or repost it) so that we can run the service. This licence lasts while your content is on Akọ and for a reasonable time afterwards to remove it from our systems, and continues for copies others have legitimately shared or purchased.",
        "You promise that you have the rights to what you post, and that it does not break the law or anyone else's rights. You are responsible for your content. We may review, limit or remove content, and we use automated checks before posts and comments are published.",
      ],
    },
    {
      id: "acceptable-use",
      title: "What you must not do",
      blocks: [
        [
          "Post or share anything illegal, or that sexually exploits or endangers children.",
          "Harass, threaten, bully, dox or incite violence or hatred against any person or group.",
          "Post spam, scams, phishing, malware or misleading offers, or impersonate another person, brand or organisation.",
          "Infringe copyright, trademarks or other rights, including uploading music, books or files you do not have the right to share.",
          "Manipulate Akọ, including fake engagement, self-gifting, coordinated farming of Give Back rewards, abusing referrals or affiliate links, or creating multiple accounts to get around a limit or a restriction.",
          "Scrape, reverse engineer or overload Akọ, bypass security, access accounts that are not yours, or interfere with how Akọ works.",
          "Record, capture or redistribute paid content, meetings or rooms without permission from the creator or host.",
          "Use Akọ to move money in ways that break the law, including money laundering.",
        ],
        "You can report a post, comment, account or project from the app. We review reports and may remove content, restrict features or suspend accounts.",
      ],
    },
    {
      id: "projects",
      title: "Projects, purchases and access",
      blocks: [
        [
          "Creators set the price, description and terms of their own projects and must describe them honestly. Prices are shown in the amounts and currencies the app displays, and conversion rates between US dollars and Naira are updated regularly.",
          "When you buy a project, you get access to it in your library for as long as it is available on Akọ, for your own personal use. You may not resell or redistribute it unless the creator allows it.",
          "Events, meetings and rooms run at the times the host sets. If a host cancels a paid event or session, refunds follow the cancellation choice the host makes and which Akọ shows at that time. Digital items you have already accessed are generally not refundable, except where the law requires or Akọ decides otherwise in a dispute.",
          "Gigs are agreements between the creator and the person hiring them. We provide the tools but do not guarantee the quality, timing or outcome of any gig.",
          "Guest passes give access only to what the sender chose to share and may be limited or withdrawn.",
        ],
      ],
    },
    {
      id: "wallet",
      title: "Wallet, gifts and withdrawals",
      blocks: [
        [
          "Your Akọ wallet is an internal balance used for purchases, gifts, promotions and earnings on Akọ. It is not a bank account, does not earn interest, and is not insured. Deposits are processed by our payment provider.",
          "Gifts are final once sent. They are voluntary and are not refundable except where required by law or where we reverse them for fraud, abuse or error.",
          "You can request to withdraw eligible earnings to a bank account in your own name. Withdrawals are subject to a minimum amount, verification and risk checks, processing schedules and any fees shown to you before you confirm. Funds that are pending, held or reserved are not withdrawable. Payouts are processed in batches, so they are not instant.",
          "We may delay, hold or reverse transactions we reasonably believe are fraudulent, mistaken, abusive or unlawful, or that we are required by law to hold.",
          "You are responsible for any taxes that apply to what you earn on Akọ.",
        ],
      ],
    },
    {
      id: "promotions",
      title: "Promotions and Give Back",
      blocks: [
        [
          "Creators can pay to promote content. Each promotion is reviewed and may be approved or declined by Akọ. A declined promotion is fully refunded to the promoter's wallet. If you end a running promotion early, undelivered days are refunded on a prorated basis.",
          "Give Back shares an amount set by Akọ for approved promotions among people whose genuine engagement helped the promoted post. Amounts, eligibility and how contribution is measured are decided by Akọ, may change, and are not guaranteed. Rewards gained through manipulation, duplicate accounts or farming will be withheld or reversed.",
        ],
      ],
    },
    {
      id: "affiliates",
      title: "Affiliate program",
      blocks: [
        "Where a creator offers it on an eligible paid project, you can fork it as an affiliate, receive a unique link, and earn the creator's commission when people buy through your link. Forking a project does not make you its owner. A creator's commission rate applies to sales made after any change, and past commissions are not affected. You must promote honestly, follow the law on advertising and disclosure, and not use spam or misleading claims. Commissions from fraudulent, self-referred or refunded sales may be withheld or reversed.",
      ],
    },
    {
      id: "messaging",
      title: "Messaging, meetings and recordings",
      blocks: [
        "Be respectful in chats, rooms and meetings. Hosts may record meetings and rooms, and must let participants know when they do. Do not record or share other people's private messages or sessions without their permission. Chats are not end-to-end encrypted at this time, as explained in the Privacy Policy.",
      ],
    },
    {
      id: "copyright",
      title: "Copyright and licensed content",
      blocks: [
        "We respect intellectual property and expect you to do the same. If you believe something on Akọ infringes your rights, email us with a description of the work, where it appears on Akọ, and your contact details. We may remove content and suspend repeat infringers. Music on Akọ may be subject to licence terms that you accept when you use it, and you must follow them.",
      ],
    },
    {
      id: "our-rights",
      title: "Akọ's rights",
      blocks: [
        "The Akọ name, logo, design, software and the content we create belong to us or our licensors. We give you a limited, personal, revocable licence to use Akọ as intended. You may not copy, modify, sell or exploit any part of Akọ except as these terms allow. If you send us feedback or ideas, we may use them without owing you anything.",
      ],
    },
    {
      id: "third-parties",
      title: "Third-party services and links",
      blocks: [
        "Akọ relies on third-party services, such as payment, hosting, live video and sign-in providers, and may link to websites we do not control. We are not responsible for them, and their own terms apply when you use them.",
      ],
    },
    {
      id: "termination",
      title: "Suspension and ending your account",
      blocks: [
        "You can deactivate your account at any time from Settings. We may suspend or end your access, remove content, or restrict features if you break these terms, put others at risk, or where the law requires, with notice where we reasonably can. If your account ends, wallet balances you are entitled to remain subject to our checks and are paid out through the normal withdrawal process, unless we hold them because of fraud, abuse, a dispute or a legal requirement. Sections that by their nature should continue, such as those on content licence, payments owed, disclaimers, liability and governing law, continue after your account ends.",
      ],
    },
    {
      id: "disclaimers",
      title: "Disclaimers",
      blocks: [
        "Akọ is provided \"as is\" and \"as available\". We work to keep it reliable and secure, but we do not promise that it will always be available, error-free or free of harmful content. Content on Akọ is posted by its users. Opinions, courses, advice and gigs are theirs and not ours, and nothing on Akọ is professional, financial, legal or medical advice.",
      ],
    },
    {
      id: "liability",
      title: "Limit of liability",
      blocks: [
        "To the fullest extent the law allows, Akọ and the people behind it are not liable for indirect, incidental, special or consequential losses, or for loss of profits, data or goodwill, arising from your use of Akọ. Our total liability for any claim relating to Akọ is limited to the greater of the amount you paid to Akọ in the 12 months before the claim or NGN 50,000. Nothing in these terms limits liability that cannot be limited by law.",
        "You agree to compensate us for losses and costs arising from your content, your breach of these terms, or your violation of anyone else's rights.",
      ],
    },
    {
      id: "law",
      title: "Governing law and disputes",
      blocks: [
        "These terms are governed by the laws of the Federal Republic of Nigeria. Please contact us first and we will try to resolve any dispute informally. If we cannot, the courts of Nigeria have jurisdiction, except where the law of your country gives you the right to bring a claim elsewhere.",
      ],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      blocks: [
        "We may update these terms as Akọ changes. When we make a significant change we will tell you in the app or by email before it takes effect. If you keep using Akọ after the change takes effect, you accept the updated terms. If you do not accept them, you can deactivate your account.",
      ],
    },
    {
      id: "contact",
      title: "Contact us",
      blocks: [
        `Questions about these terms, copyright notices or legal requests can be sent to ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};
