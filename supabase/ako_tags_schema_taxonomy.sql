-- ako_tags_schema_taxonomy.sql
--
-- Unified tag system, part 1: schema + widened taxonomy.
--
--   domain (tag_domains)  ->  category (categories)  ->  tag (interests)
--
-- "Interests", "topics" and "tags" are one thing in Akọ: a row in public.interests.
-- Profiles choose them (user_interests); posts, projects/groups/talents and pages carry them
-- (post_topics, project_topics, page_interests); hashtags resolve to them (hashtags.interest_id).
-- This file adds what the connective tissue needs: stable slugs, aliases (for hashtag resolution
-- and auto-tagging), a domain level, a `source` on every content<->tag link, and the widened
-- taxonomy built from the niches of the automated accounts and the platform's own verticals.

create table if not exists public.tag_domains (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null default 0
);
alter table public.tag_domains enable row level security;
drop policy if exists "Tag domains are publicly readable" on public.tag_domains;
create policy "Tag domains are publicly readable" on public.tag_domains for select using (true);
drop policy if exists "Admins manage tag domains" on public.tag_domains;
create policy "Admins manage tag domains" on public.tag_domains for all
  using (is_admin_or_moderator((select auth.uid()))) with check (is_admin_or_moderator((select auth.uid())));

alter table public.categories add column if not exists domain_id uuid references public.tag_domains(id) on delete set null;
create index if not exists idx_categories_domain on public.categories(domain_id);

alter table public.interests
  add column if not exists slug text,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0;

-- Helpers -------------------------------------------------------------------------------------
create or replace function public.tag_slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p, '')), '[''’]', '', 'g'), '&', ' and ', 'g'), '[^a-z0-9]+', '-', 'g'))
$$;
-- The hashtag form of any text: lowercase letters and digits only ("Web3 & Blockchain" -> web3blockchain).
create or replace function public.tag_key(p text) returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g')
$$;

-- One node per idea: "Work-Life Balance" existed under both Wellness and Productivity. Merge into Productivity.
do $$
declare keep uuid; dup uuid;
begin
  select i.id into keep from public.interests i join public.categories c on c.id = i.category_id where i.name = 'Work-Life Balance' and c.slug = 'productivity';
  select i.id into dup  from public.interests i join public.categories c on c.id = i.category_id where i.name = 'Work-Life Balance' and c.slug = 'wellness';
  if keep is not null and dup is not null then
    insert into public.user_interests(user_id, interest_id, created_at) select user_id, keep, created_at from public.user_interests where interest_id = dup on conflict do nothing;
    delete from public.user_interests where interest_id = dup;
    insert into public.post_topics(post_id, interest_id) select post_id, keep from public.post_topics where interest_id = dup on conflict do nothing;
    delete from public.post_topics where interest_id = dup;
    insert into public.project_topics(project_id, interest_id) select project_id, keep from public.project_topics where interest_id = dup on conflict do nothing;
    delete from public.project_topics where interest_id = dup;
    insert into public.page_interests(page_id, interest_id) select page_id, keep from public.page_interests where interest_id = dup on conflict do nothing;
    delete from public.page_interests where interest_id = dup;
    delete from public.interests where id = dup;
  end if;
end $$;

-- Domains -------------------------------------------------------------------------------------
insert into public.tag_domains (slug, name, sort_order) values
  ('tech-ai', 'Tech & AI', 1),
  ('money-business', 'Money & Business', 2),
  ('learning-career', 'Learning, Career & Knowledge', 3),
  ('mind-life', 'Mind, Faith & Purpose', 4),
  ('health-family', 'Health, Family & Relationships', 5),
  ('society-africa', 'Society, Politics & Africa', 6),
  ('culture-creative', 'Culture & Creative Arts', 7),
  ('nature-lifestyle', 'Nature, Travel & Lifestyle', 8)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

-- Categories: slug|name|domain|sort (existing categories keep their names; they only gain a domain + order)
insert into public.categories (slug, name, sort_order, is_active, domain_id)
select s.slug, s.name, s.sort, true, d.id
from (
  select btrim(split_part(l, '|', 1)) slug, btrim(split_part(l, '|', 2)) name, btrim(split_part(l, '|', 3)) dom, btrim(split_part(l, '|', 4))::int sort
  from regexp_split_to_table($cats$
ai|AI|tech-ai|10
ai-building|AI Building & Automation|tech-ai|11
technology|Technology|tech-ai|12
software-product|Software & Product|tech-ai|13
business|Business|money-business|20
entrepreneurship|Entrepreneurship|money-business|21
marketing-sales|Marketing & Sales|money-business|22
finance|Finance|money-business|23
fintech|Fintech|money-business|24
wealth-creation|Wealth Creation|money-business|25
trading-investing|Trading & Investing|money-business|26
economics|Economics|money-business|27
real-estate|Real Estate|money-business|28
agribusiness-energy|Agriculture, Energy & Industry|money-business|29
education|Education|learning-career|30
career|Career|learning-career|31
science|Science|learning-career|32
productivity|Productivity|learning-career|33
leadership-communication|Leadership & Communication|learning-career|34
philosophy|Philosophy|mind-life|40
psychology|Psychology|mind-life|41
personal-development|Personal Development|mind-life|42
self-actualization|Self-Actualization|mind-life|43
purpose|Purpose|mind-life|44
spirituality|Spirituality|mind-life|45
theology-faith|Theology & Faith|mind-life|46
wellness|Wellness|health-family|50
health|Health|health-family|51
mens-health|Men's Health|health-family|52
family-parenting|Family & Parenting|health-family|53
relationships-society|Relationships & Society|health-family|54
politics|Politics|society-africa|60
civic-life|Civic Life & Accountability|society-africa|61
geopolitics-news|Geopolitics & News|society-africa|62
african-development|African Development|society-africa|63
pan-african-sovereignty|Pan-African Sovereignty|society-africa|64
history-culture|History & Culture|culture-creative|70
writing-books|Writing & Books|culture-creative|71
creative-arts|Creative Arts|culture-creative|72
entertainment-showbiz|Entertainment & Showbiz|culture-creative|73
fashion|Fashion|culture-creative|74
nature-geography|Nature & Geography|nature-lifestyle|80
food-lifestyle|Food & Lifestyle|nature-lifestyle|81
sports|Sports|nature-lifestyle|82
$cats$, E'\n') l where btrim(l) <> ''
) s join public.tag_domains d on d.slug = s.dom
on conflict (slug) do update set domain_id = excluded.domain_id, sort_order = excluded.sort_order;

-- Tags: category|name|alias;alias;...   (aliases drive hashtag resolution and auto-tagging; lowercase, whole-phrase matched)
insert into public.interests (category_id, name, aliases, slug, sort_order, is_active)
select c.id, s.name, s.aliases, public.tag_slugify(s.name), s.ord, true
from (
  select btrim(split_part(l, '|', 1)) cat, btrim(split_part(l, '|', 2)) name,
         coalesce((select array_agg(distinct lower(btrim(a))) from unnest(string_to_array(split_part(l, '|', 3), ';')) a where btrim(a) <> ''), '{}') aliases,
         (row_number() over (partition by btrim(split_part(l, '|', 1)) order by ord))::int ord
  from regexp_split_to_table($tags$
ai|Generative AI|generative ai;genai;chatgpt;gemini;llm;llms;large language model;midjourney;text to image;image generation
ai|AI Tools & Products|ai tool;ai tools;ai assistant;copilot;ai app;ai apps;ai product;ai startup
ai|Machine Learning|machine learning;deep learning;neural network;neural networks;model training;training data;data science
ai|AI Ethics|ai ethics;ai safety;algorithmic bias;responsible ai;ai regulation;deepfake;deepfakes;ai governance
ai|AI in Africa|ai in africa;african ai;africa ai;ai adoption in africa;ai for africa
ai-building|Prompt Engineering|prompt engineering;prompting;system prompt;prompt design;prompts
ai-building|AI Agents & Automation|ai agent;ai agents;agentic;workflow automation;automation workflow;n8n;zapier
ai-building|No-Code & Low-Code|no-code;nocode;low-code;lowcode;bubble.io;glide apps
ai-building|AI Image & Video|ai image;ai video;comfyui;stable diffusion;text to video;image to video;ai animation;lora
ai-building|AI for Creatives|ai for creatives;ai music;ai art;ai filmmaking;ai film;ai cinema;ai design
ai-building|AI Literacy & Training|ai literacy;ai training;ai workshop;ai course;learn ai;ai skills;ai education
ai-building|Open Models & Fine-Tuning|fine-tuning;fine tuning;open source model;huggingface;hugging face;open-weight;local model
technology|Software Development|software development;programming;coding;software engineer;github;javascript;python;typescript
technology|Cybersecurity|cybersecurity;cyber security;hacking;data breach;phishing;malware;infosec
technology|Gadgets & Devices|gadget;gadgets;smartphone;smartphones;iphone;android phone;laptop;wearable
technology|Tech Culture|tech culture;tech industry;silicon valley;big tech;tech news;tech community
technology|Web3 & Blockchain|web3;blockchain;nft;nfts;smart contract;ethereum;decentralized
software-product|Mobile App Development|mobile app;mobile apps;react native;expo;flutter;android app;ios app;app development
software-product|Web Development|web development;frontend;front-end;backend;back-end;website;web app;web design
software-product|UI & UX Design|ui design;ux design;user experience;user interface;figma;wireframe;design system;product design
software-product|Product Management|product management;product manager;roadmap;product strategy;user research
software-product|Data & Analytics|data analytics;data analysis;dashboard;business intelligence;data visualization;big data
software-product|Cloud & DevOps|cloud computing;devops;aws;azure;kubernetes;docker;serverless
software-product|Open Source|open source;open-source;pull request;github repo;maintainer
business|Startups|startup;startups;founder;founders;seed round;pitch deck;accelerator;incubator
business|Small Business|small business;smes;sme;msme;local business;shop owner;small businesses
business|Corporate Strategy|corporate strategy;business strategy;competitive advantage;market positioning;strategic planning
business|Management & Operations|operations management;operational efficiency;process improvement;business operations;team management
business|Negotiation|negotiation;negotiating;negotiate;bargaining;deal making
entrepreneurship|Building a Startup|building a startup;startup journey;co-founder;cofounder;mvp launch;product market fit
entrepreneurship|Bootstrapping|bootstrapping;bootstrapped;self-funded;lean startup;low capital
entrepreneurship|Business Models|business model;business models;revenue model;subscription model;marketplace model;monetisation;monetization
entrepreneurship|Side Hustles|side hustle;side hustles;extra income;side income
entrepreneurship|Venture Capital|venture capital;vc funding;angel investor;funding round;term sheet
marketing-sales|Digital Marketing|digital marketing;seo;facebook ads;google ads;email marketing;social media marketing;growth marketing;marketing strategy
marketing-sales|Branding|branding;brand identity;brand strategy;brand voice;rebrand;brand story
marketing-sales|Social Media Growth|social media growth;go viral;engagement rate;instagram growth;tiktok growth;content calendar;grow your audience
marketing-sales|Content Creation|content creation;content creator;content creators;creator economy;youtube channel;vlog;influencer
marketing-sales|Sales & Customers|sales funnel;lead generation;customer service;customer retention;closing deals;selling
marketing-sales|E-commerce|e-commerce;ecommerce;online store;online shop;dropshipping;jumia;shopify;online selling
finance|Personal Finance|personal finance;saving money;savings;emergency fund;money tips
finance|Budgeting|budget;budgeting;monthly budget;expense tracking
finance|Financial Literacy|financial literacy;money management;money lessons;financial education;money habits
finance|Debt & Credit|debt;credit score;loan;loans;borrowing;credit card;debt free
finance|Insurance|insurance;life insurance;health insurance;insurer
fintech|Digital Payments|digital payments;payment gateway;paystack;flutterwave;pos terminal;cashless;payment app
fintech|Mobile Money|mobile money;mpesa;m-pesa;opay;palmpay;mobile wallet
fintech|Financial Inclusion|financial inclusion;unbanked;microfinance;microloan;financial access
fintech|Banking Innovation|neobank;digital bank;open banking;banking app;banking innovation
fintech|Blockchain Finance|defi;decentralized finance;stablecoin;stablecoins;tokenization;on-chain
wealth-creation|Building Assets|building assets;asset building;net worth;appreciating assets
wealth-creation|Financial Independence|financial independence;financial freedom;retire early;fire movement
wealth-creation|Generational Wealth|generational wealth;inheritance;family wealth;wealth transfer;legacy wealth
wealth-creation|Investing Basics|investing basics;how to invest;beginner investing;index fund;compound interest;compounding
wealth-creation|Passive Income|passive income;dividends;royalties;residual income;rental yield
trading-investing|Stock Market|stock market;stocks;equities;ngx;nigerian exchange;shares;nasdaq
trading-investing|Crypto Trading|crypto trading;bitcoin;btc;crypto;altcoin
trading-investing|Forex Trading|forex;fx trading;currency trading;forex market
trading-investing|Bonds & Fixed Income|bonds;treasury bills;fixed income;t-bills;eurobond;bond yield
trading-investing|Risk Management|risk management;risk tolerance;hedging;diversification;stop loss
economics|African Economies|african economies;african economy;nigerian economy;naira;gdp growth;economy of africa
economics|Inflation & Monetary Policy|inflation;monetary policy;interest rate;interest rates;central bank;cbn;exchange rate
economics|Macroeconomics|macroeconomics;macroeconomic;fiscal policy;recession;national debt
economics|Microeconomics|microeconomics;supply and demand;consumer behavior;market structure;opportunity cost
economics|Global Trade|global trade;trade deficit;exports;imports;tariffs;trade war
real-estate|Property Investment|property investment;real estate investment;buy to let;property market;real estate investing
real-estate|Land Acquisition|land acquisition;buying land;land title;survey plan;land fraud
real-estate|Mortgages|mortgage;mortgages;home loan;housing finance
real-estate|Real Estate Development|real estate development;property development;estate development;housing project
real-estate|Rental Income|rental income;landlord;tenant;airbnb;shortlet
agribusiness-energy|Agribusiness|agribusiness;agriculture;agro-processing;commercial farming;cocoa;cassava;food security
agribusiness-energy|Farming & Livestock|farming;farmer;farmers;livestock;poultry;fish farming;crop yield;smallholder
agribusiness-energy|Energy & Power|renewable energy;solar power;power sector;national grid;oil and gas;crude oil;petroleum;energy transition
agribusiness-energy|Natural Resources|natural resources;mining;minerals;lithium;cobalt;gold mining;resource curse;mineral wealth
agribusiness-energy|Logistics & Supply Chain|logistics;supply chain;shipping;freight;last mile;warehousing
education|Skills Development|skills development;upskilling;reskilling;skill building;vocational training;digital skills
education|Online Learning|online learning;e-learning;elearning;online course;mooc;virtual classroom
education|Higher Education|higher education;university;universities;polytechnic;postgraduate;campus life
education|Scholarships & Grants|scholarship;scholarships;grant;grants;chevening;fellowship;fully funded
education|Educational Reform|education reform;educational reform;school curriculum;education policy;education system
education|Exam Preparation|exam preparation;jamb;waec;neco;ielts;exam tips;study tips
education|Teaching & Tutoring|teaching;tutoring;teacher;teachers;lesson plan;classroom;educator
education|STEM Education|stem education;robotics;coding for kids;science education
education|Kids & Teen Learning|kids learning;children learning;adolescent learning;learning for kids;teen education;child education
career|Career Growth|career growth;promotion;career development;career path;mentor
career|Job Search|job search;job hunting;job openings;vacancy;vacancies;hiring
career|Resume & Interviews|resume;cv writing;cover letter;interview;interviews;linkedin profile
career|Remote Work|remote work;work from home;remote job;remote jobs;hybrid work;digital nomad
career|Workplace Culture|workplace culture;office politics;toxic workplace;work culture
career|Freelancing & Gigs|freelancing;freelancer;freelance;gig work;upwork;fiverr;client work
career|Professional Certifications|certification;certifications;professional exam;licensure
career|Working Abroad|working abroad;relocation;japa;visa sponsorship;skilled worker visa;work abroad
science|Scientific Method|scientific method;hypothesis;evidence based;replication;controlled experiment
science|Emerging Research|emerging research;new study;researchers found;breakthrough;scientists;peer reviewed;clinical trial
science|Biology|biology;genetics;evolution;microbiome;biologist
science|Physics|physics;quantum;relativity;particle
science|Space & Astronomy|astronomy;nasa;rocket;outer space;satellite;telescope
productivity|Time Management|time management;prioritise;prioritize;time blocking;procrastination
productivity|Focus & Deep Work|deep work;flow state;distractions;attention span
productivity|Systems & Routines|routines;morning routine;habit stacking;daily routine
productivity|Tools & Apps|productivity apps;productivity tools;notion;obsidian;todo app;task manager;note taking
productivity|Work-Life Balance|work-life balance;work life balance;burnout;overworking
leadership-communication|Team Leadership|team leadership;leadership;leader;leaders;managing people;lead a team
leadership-communication|Public Speaking|public speaking;speeches;stage fright;presentation skills;toastmaster
leadership-communication|Persuasion|persuasion;persuade;rhetoric;influence people
leadership-communication|Storytelling|storytelling;story telling;tell stories;storyteller
leadership-communication|Conflict Resolution|conflict resolution;mediation;resolving conflict;de-escalation
philosophy|Ethics|ethics;morality;ethical dilemma;right and wrong
philosophy|Logic & Reasoning|logic;reasoning;fallacy;fallacies;critical thinking
philosophy|Stoicism|stoicism;stoic;marcus aurelius;epictetus;seneca;amor fati
philosophy|Existentialism|existentialism;existential;sartre;camus;absurdism;meaning of life
philosophy|African Philosophy|african philosophy;ubuntu;igbo philosophy;akan philosophy;yoruba thought
philosophy|Political Philosophy|political philosophy;social contract;rawls;hobbes;state power
psychology|Behavioral Psychology|behavioral psychology;behaviourism;conditioning;reinforcement;behavior change;habit formation
psychology|Cognitive Bias|cognitive bias;confirmation bias;heuristics;dunning-kruger;anchoring
psychology|Human Behavior|human behavior;human behaviour;human nature;social psychology;crowd psychology
psychology|Emotional Intelligence|emotional intelligence;empathy;self-regulation;emotional awareness
psychology|Mental Health|mental health;depression;anxiety;therapy;therapist;trauma
psychology|Mental Models|mental models;first principles;second-order thinking;inversion;thinking tools
psychology|Decision Making|decision making;decision-making;judgment;trade-offs
psychology|Strategy & Power|power dynamics;game theory;machiavelli;sun tzu;art of war;laws of power
personal-development|Goal Setting|goal setting;smart goals;new year resolution
personal-development|Habits|habits;atomic habits;daily habits;habit tracker
personal-development|Self-Discipline|self-discipline;self discipline;discipline;willpower;consistency;delayed gratification
personal-development|Growth Mindset|growth mindset;fixed mindset;learn from failure;resilience
personal-development|Life Lessons|life lessons;lessons learned;things i learned
self-actualization|Self-Awareness|self-awareness;self awareness;know yourself;introspection;self-reflection
self-actualization|Identity|identity;who am i;sense of self;identity crisis
self-actualization|Finding Purpose|finding purpose;find your purpose;why you exist;reason for being;purpose
self-actualization|Authenticity|authenticity;authentic;be yourself;true self
self-actualization|Personal Mastery|personal mastery;self mastery;peak performance
self-actualization|Inner Fulfillment|inner fulfillment;inner fulfilment;contentment;inner peace
self-actualization|Life Design|life design;design your life;reinvention;life audit;life planning
purpose|Calling & Vocation|calling;vocation;your calling;divine assignment;life work
purpose|Life Direction|life direction;lost in life;crossroads;next chapter;life path
purpose|Career Purpose|career purpose;purposeful career;meaningful work;work you love
purpose|Legacy|legacy;leave a legacy;what you leave behind;generational impact
purpose|Meaning-Making|meaning-making;meaning making;finding meaning;sense of meaning
purpose|Success vs Meaning|success vs meaning;chasing success;rat race;comparison trap;comparing yourself;chasing rewards
spirituality|Meditation|meditation;meditate;breathwork;mantra
spirituality|Mindfulness|mindfulness;mindful;being present;present moment
spirituality|Inner Growth|inner growth;inner work;healing journey
spirituality|Consciousness|consciousness;awareness;subconscious;awakening
spirituality|Spiritual Practices|spiritual practice;spiritual practices;rituals;retreat;contemplation
theology-faith|Christianity|christianity;christian;church;jesus;gospel;bible;pastor
theology-faith|Church & Ministry|church ministry;ministry;church growth;parish;choir;church leadership;pastoral
theology-faith|Prayer & Devotion|prayer;prayers;devotion;devotional;fasting;worship
theology-faith|Bible & Scripture|scripture;bible study;bible verse;biblical;sermon;theology
theology-faith|Faith & Reason|faith and reason;faith & reason;apologetics;science and religion
theology-faith|Islam|islam;islamic;muslim;quran;ramadan;hadith;sharia
theology-faith|Comparative Religion|comparative religion;world religions;interfaith;religious studies
theology-faith|Traditional African Religion|traditional african religion;african traditional religion;ifa;orisha;ancestral worship
wellness|Mental Wellness|mental wellness;emotional wellbeing;self-care;self care;wellbeing
wellness|Nutrition|nutrition;nutritionist;diet;balanced diet;vitamins;eating habits
wellness|Sleep|sleep;insomnia;sleep hygiene;circadian
wellness|Stress Management|stress management;stress;coping;relaxation;cortisol
wellness|Natural Health|natural health;natural remedies;naturopathy;naturalist;holistic health
wellness|Herbal & Natural Remedies|herbal;herbs;herbal tea;traditional medicine;moringa;turmeric;bitter leaf
wellness|Gut Health|gut health;probiotics;digestion;bloating;constipation
wellness|Healthy Ageing|healthy ageing;healthy aging;longevity;live longer;aging well
wellness|Evidence-Based Habits|evidence-based habits;science-backed;health habits;daily health habits
wellness|Traditional African Foods|traditional foods;african foods;local foods;ogi;ofada rice;egusi;millet;sorghum;fonio
health|Fitness|fitness;workout;exercise;gym;cardio;strength training
health|Preventive Health|preventive health;screening;check-up;checkup;prevention;vaccination;immunisation
health|Chronic Illness Awareness|chronic illness;diabetes;hypertension;sickle cell;chronic disease
health|Healthcare Systems|healthcare system;healthcare systems;hospitals;nhis;primary healthcare;health workers
health|Nutrition Science|nutrition science;nutrients;clinical nutrition;metabolism;glycemic
health|Nursing & Midwifery|nursing;nurse;nurses;midwife;midwifery
health|Women's Health|women's health;womens health;menstrual;pregnancy;fertility;menopause
health|Public Health & Epidemics|public health;epidemic;outbreak;malaria;lassa fever;cholera
health|Child Health|child health;paediatric;pediatric;immunization schedule;infant;breastfeeding
mens-health|Men's Wellness|men's wellness;mens wellness;men's health;mens health;masculinity
mens-health|Fatherhood|fatherhood;father;dad;dads;raising sons
mens-health|Hormonal Health|hormonal health;testosterone;hormones
mens-health|Mental Health for Men|mental health for men;men's mental health;men and mental health;men open up
mens-health|Physical Fitness|physical fitness;bodybuilding;muscle;men's fitness
family-parenting|Marriage|marriage;marriages;wedding;weddings;husband and wife;spouse;marital;newlyweds
family-parenting|Parenting|parenting;parents;raising children;raising kids;child upbringing;bring up children
family-parenting|Love & Commitment|love and commitment;true love;commitment;faithfulness;love language;love languages
family-parenting|Family Values|family values;household values;family foundation;family unity;family traditions
family-parenting|Child Development|child development;toddler;toddlers;early childhood;developmental milestones;teenagers;adolescents
family-parenting|Abuse Prevention & Safety|domestic violence;coercion;coercive control;red flags;emotional abuse;child protection;gender based violence
family-parenting|Single Parenting & Blended Families|single parent;single mother;single father;blended family;stepchildren;co-parenting;divorce
family-parenting|Elder Care|elder care;elderly parents;ageing parents;aging parents;caring for parents;grandparents
family-parenting|Household Management|household management;home management;household chores;family budget;running a home;homemaking
family-parenting|Premarital Preparation|premarital;premarital counselling;pre-marital;marriage preparation;choosing a partner
relationships-society|Community Building|community building;communities;neighbourhood;town union;village meeting;cooperative
relationships-society|Dating & Relationships|dating;relationship advice;boyfriend;girlfriend;situationship;breakup;courtship
relationships-society|Family Dynamics|family dynamics;in-laws;extended family;family conflict;siblings;family relations
relationships-society|Friendship|friendship;friendships;best friend;toxic friends
relationships-society|Social Issues|social issues;poverty;inequality;homelessness;gender inequality;social justice
politics|African Politics|african politics;african union;african leaders;coup;coups;sahel politics
politics|Nigerian Politics|nigerian politics;nigeria politics;apc;pdp;labour party;national assembly;senate;state governors
politics|Elections|election;elections;ballot;electoral;inec;voter;vote buying;polling unit
politics|Governance|governance;good governance;public office;corruption in government;institutions;rule of law
politics|International Relations|international relations;diplomacy;foreign policy;bilateral;united nations
politics|Policy Analysis|policy analysis;public policy;policy brief;policy reform;legislation
civic-life|Civic Responsibility|civic responsibility;civic duty;good citizen;citizenship;public property;civic education;civic values
civic-life|Accountability & Anti-Corruption|accountability;corruption;anti-corruption;efcc;icpc;bribery;embezzlement;looting;whistleblower
civic-life|Nation Building|nation building;nation-building;build the nation;patriotism;national development;rebuilding nigeria
civic-life|Tribalism & National Unity|tribalism;ethnicity;ethnic divide;national unity;ethnic politics;nepotism;marginalisation;marginalization
civic-life|Cost of Living|cost of living;fuel price;fuel subsidy;food prices;hardship;electricity tariff;minimum wage;ordinary people
civic-life|Public Services|public services;bad roads;power supply;water supply;public transport;public schools;public hospitals
civic-life|Human Rights & Justice|human rights;justice system;police brutality;judiciary;court ruling;freedom of speech;press freedom
civic-life|Security & Safety|insecurity;banditry;kidnapping;terrorism;boko haram;herdsmen;policing
civic-life|Youth Civic Engagement|young voters;youth in politics;civic engagement;youth movement;protest;activism
geopolitics-news|Africa Headlines|africa news;africa headlines;news from africa;this week in africa;africa briefing;morning briefing
geopolitics-news|Geopolitics|geopolitics;geopolitical;great power;superpowers;sanctions;global order;brics;nato
geopolitics-news|Africa & the World|china in africa;us africa;russia africa;france africa;foreign investment in africa;belt and road;africa summit
geopolitics-news|Conflict & Peace|conflict zones;ceasefire;peacekeeping;insurgency;sahel crisis;sudan war;military junta
geopolitics-news|Nigeria Today|nigeria;nigerian;nigerians;naija;lagos;abuja
geopolitics-news|West Africa|west africa;west african;ecowas
geopolitics-news|East Africa|east africa;kenya;nairobi;ethiopia;tanzania;uganda;rwanda;kigali
geopolitics-news|North Africa|north africa;egypt;morocco;algeria;tunisia;libya;maghreb
geopolitics-news|Southern Africa|southern africa;south africa;zimbabwe;zambia;botswana;namibia;mozambique;sadc
geopolitics-news|Central Africa|central africa;congo;drc;cameroon;gabon;kinshasa
african-development|African Innovation|african innovation;african startups;african tech;innovation hub;africa startup scene
african-development|Pan-Africanism|pan-africanism;pan africanism;pan-african;african unity;nkrumah;sankara;one africa
african-development|Youth Empowerment|youth empowerment;young africans;empower youth;youth skills;youth entrepreneurship;youth unemployment
african-development|Diaspora & Migration|diaspora;migration;emigration;remittance;returnee
african-development|Infrastructure|infrastructure;railway;rail line;highway;airport;power grid
pan-african-sovereignty|Economic Sovereignty|economic sovereignty;economic independence;economic freedom;own our resources;value addition;economic self-determination
pan-african-sovereignty|Decolonisation|decolonisation;decolonization;mental liberation;colonial mentality;neocolonialism;neo-colonialism;francafrique
pan-african-sovereignty|Continental Integration|afcfta;african continental free trade;intra-african trade;single african market;african passport;free movement
pan-african-sovereignty|African Languages|african languages;mother tongue;igbo language;yoruba language;hausa language;swahili;indigenous languages
pan-african-sovereignty|Made in Africa|made in africa;african brands;buy african;local content;local manufacturing;african-owned
pan-african-sovereignty|African Industrialisation|industrialisation;industrialization;factories;industrial policy;value chains
history-culture|African History|african history;history of africa;ancient africa;benin kingdom
history-culture|African Empires & Kingdoms|african empires;mali empire;songhai empire;ashanti;zulu kingdom;kingdom of benin;oyo empire;kanem-bornu;aksum;great zimbabwe;mansa musa
history-culture|Pre-Colonial Africa|pre-colonial africa;precolonial africa;before colonialism;before the europeans;trans-saharan trade
history-culture|Colonial Era & Independence|colonialism;colonial era;independence movement;scramble for africa;berlin conference;liberation struggle
history-culture|Archaeology & Heritage|archaeology;archaeological;heritage site;heritage sites;unesco;ancient ruins;excavation;artefacts;artifacts
history-culture|African Inventors & Achievers|african inventor;african inventors;african achievers;first african;african scientists;african pioneers
history-culture|Lost Industries & Ancient Technology|lost industries;ancient technology;iron smelting;african metallurgy;nok culture;ancient mining;traditional engineering
history-culture|Cultural Identity|cultural identity;african identity;cultural pride;igbo culture;yoruba culture;hausa culture
history-culture|Traditions|traditions;customs;rites of passage;festival;festivals;new yam festival;marriage rites
history-culture|Oral Tradition & Folklore|oral tradition;folklore;folktale;folktales;proverb;proverbs;griot;griots
history-culture|Historical Analysis|historical analysis;history lessons;historiography;what history teaches
history-culture|World History|world history;roman empire;world war;cold war;ancient egypt;ancient greece;industrial revolution
writing-books|Book Recommendations|book recommendation;book recommendations;books to read;reading list;must read;recommended reading
writing-books|Book Summaries & Lessons|book summary;book summaries;lessons from;key takeaways;chapter summary
writing-books|African Literature|african literature;chinua achebe;adichie;ngugi;things fall apart;african novels;african writers
writing-books|Writing Craft|writing craft;writing tips;copywriting;write better;editing
writing-books|Journaling|journaling;journal;diary;morning pages;gratitude journal
writing-books|Publishing|publishing;self-publishing;publisher;literary agent;ebook;manuscript
creative-arts|Music Production|music production;beat making;beats;mixing and mastering;fl studio;studio session;sound design
creative-arts|Songwriting & Composition|songwriting;songwriter;composition;composer;lyrics;choral arrangement;arranging music
creative-arts|Gospel & Church Music|gospel music;worship music;choir music;choir director;hymn;hymns;praise and worship;church choir
creative-arts|Film & Video Production|film production;filmmaking;filmmaker;cinematography;screenplay;short film;video editing;film set;cinematic
creative-arts|Animation & Motion|animation;animator;motion graphics;3d animation;character design;storyboard;after effects
creative-arts|Graphic Design|graphic design;graphic designer;typography;poster design;logo design;photoshop;canva
creative-arts|Photography|photography;photographer;photo shoot;portrait;lightroom;photoshoot
creative-arts|Visual Art & Painting|painting;painter;visual art;art exhibition;sculpture;illustration;art gallery
creative-arts|Poetry & Spoken Word|poetry;poem;poet;spoken word;slam poetry;poems
creative-arts|Dance & Performance|dance;dancer;choreography;stage play;theatre;theater;performance art
creative-arts|Podcasting & Audio|podcast;podcasting;audio drama;voice over;voiceover;audiobook;radio show
entertainment-showbiz|Movies & TV|movies;tv series;netflix;box office;film review;tv show;sitcom
entertainment-showbiz|Nollywood & Global Cinema|nollywood;kannywood;african cinema;hollywood;nigerian film;film industry
entertainment-showbiz|Music & Concerts|concert;concerts;album;afrobeats;new music;music video;live show
entertainment-showbiz|Celebrity Culture|celebrity;celebrities;red carpet;paparazzi;gossip
entertainment-showbiz|Gaming & Esports|gaming;esports;gamer;video game;playstation;xbox;mobile gaming
fashion|African Fashion|african fashion;ankara;aso ebi;kente;adire;agbada;african print
fashion|Fashion Business|fashion business;fashion brand;fashion designer;tailoring business;clothing line
fashion|Personal Style|personal style;outfit;outfits;what to wear;styling;wardrobe
fashion|Street Style|street style;streetwear;sneakers;thrift;urban fashion
fashion|Sustainable Fashion|sustainable fashion;slow fashion;upcycling;thrifting;ethical fashion;fast fashion
nature-geography|Natural Wonders|natural wonders;waterfall;waterfalls;mountain;desert;national park;rainforest;wonders of africa;volcano
nature-geography|Wildlife & Conservation|wildlife;conservation;elephants;lions;safari;endangered species;rhino;poaching;biodiversity
nature-geography|African Geography|african geography;river niger;the nile;sahara;rift valley;congo basin;lake chad;geography of africa
nature-geography|Environment & Climate|climate change;deforestation;flooding;drought;global warming;pollution;climate adaptation
nature-geography|Travel & Tourism|tourism;tourist attractions;travel destinations;travel guide;visit africa;road trip;vacation
food-lifestyle|African Cuisine & Food Culture|african cuisine;food culture;jollof;suya;street food;nigerian food;local cuisine
food-lifestyle|Cooking & Recipes|cooking;recipe;recipes;how to cook;baking;meal prep;chef
food-lifestyle|Home & Interior|interior design;home decor;home decoration;furniture;renovation
food-lifestyle|Beauty & Grooming|beauty;skincare;hair care;grooming;makeup;natural hair;barber
food-lifestyle|Cars & Mobility|car review;automobile;electric vehicle;mechanic
sports|Football|football;soccer;premier league;super eagles;afcon;champions league;la liga
sports|Athletics & Olympics|athletics;olympics;olympic;sprinter;marathon;track and field
sports|Sports Business|sports business;transfer market;sports betting;sponsorship;sports management
$tags$, E'\n') with ordinality as t(l, ord) where btrim(l) <> ''
) s join public.categories c on c.slug = s.cat
on conflict (category_id, name) do update
  set aliases = excluded.aliases,
      sort_order = excluded.sort_order,
      slug = coalesce(public.interests.slug, excluded.slug),
      is_active = true;

update public.interests set slug = public.tag_slugify(name) where slug is null;
create unique index if not exists interests_slug_key on public.interests(slug);
create index if not exists idx_interests_sort on public.interests(category_id, sort_order);

-- Tags created later (admin screen, API) get a slug automatically.
create or replace function public.interests_set_slug() returns trigger language plpgsql as $$
begin
  if new.slug is null or btrim(new.slug) = '' then new.slug := public.tag_slugify(new.name); end if;
  return new;
end $$;
drop trigger if exists trg_interests_set_slug on public.interests;
create trigger trg_interests_set_slug before insert or update of name on public.interests
  for each row execute function public.interests_set_slug();
