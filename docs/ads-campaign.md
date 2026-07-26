# The Google Ads build sheet

Everything needed to build (and fix) the Search test, in the order the Ads UI asks for it.
Every asset below is inside Google's character limits (headlines <= 30, descriptions <= 90).

**Tooling:** this structure is executable via the global **adkit** CLI (private repo
`dbaxterbchain/adkit`): `adkit report|build|manage|assets --client sss ...`. The machine
spec mirroring this sheet lives at `adkit/clients/sss/campaigns.json`; keep them in step.
Credential setup: adkit's docs/setup.md (stub here: [ads-api-setup.md](ads-api-setup.md)).
`ads/editor-import/` remains as the historical zero-credential Ads Editor import.

**Read this first:** the consumer test **buys data, not customers**. At $8/month the CAC maths does
not close, and **zero to two subscriptions from $300 to $500 is the expected outcome**. Judge it on
**cost per started conversation**. The **business (B2B) campaign is different**: a team is worth far
more (5+ seats, recurring, plus white-label), so that one is allowed to chase leads. See the decision
rules at the bottom.

---

## 0. What went wrong the first run (post-mortem, 2026-07-24)

The first launch ran ~30 days and got **2 impressions, 0 clicks, $0 spent** (and 0 impressions in the
final week, even after match types were broadened and Google's automated bidding was switched on).

It was **not** keywords, geo, or approval. From the account export:

- Every keyword was **Enabled** (no "Low search volume", no disapprovals), broad match was live, and
  impressions were still ~0. Broad match with zero impressions in a week only happens when the **bid
  is below the ad-rank threshold**, so the ads barely enter auctions.
- **Auction Insights** showed we were eligible in only ~11 auctions all month at **0% top-of-page
  rate**, against premium-vertical competitors (betterhelp.com, franklincovey.com, insperity.com,
  topresume.com). A **$2.50** CPC cap cannot clear the reserve in those auctions.
- Then switching to **Maximize Conversions with zero conversion history** (the funnel had never
  carried real traffic, so the account has 0 conversions) made it worse: Smart Bidding with nothing
  to learn from bids almost nothing, so it serves almost nothing. A death spiral.

**The fix is the bid strategy, not the keywords.** See section 1a.

---

## 1a. If impressions are ~0, fix this first (do these in order)

1. **Revert to a non-conversion bid strategy.** Set bidding to **Maximize Clicks with a max CPC cap**
   (or Manual CPC). **Never** use Maximize Conversions / Target CPA / Target ROAS until the account
   has **15-30 conversions**. With 0 conversions, Smart Bidding cannot function.
2. **Raise the CPC cap until the ads clear the reserve.** Start **$10** (consumer) / **$14** (B2B).
   These sit in therapy / HR / corporate-training auctions where real first-page CPCs run ~$3-8+. The
   high cap exists to **get out of the zero-impression hole first**; pull it down toward the actual
   first-page CPC once real keyword data appears.
3. **Turn OFF Auto-apply recommendations** (Recommendations -> Auto-apply -> turn everything off). It
   silently re-enables Search partners, adds broad match, and flips you back to Smart Bidding.
4. **Confirm the serving basics** (one-time): billing active with a valid card; ads show **Approved**;
   Search partners **OFF**, Display **OFF**; Location option = **Presence**.
5. **Check with Ad Preview & Diagnosis** (Tools -> Planning), not by Googling your own ad (that logs
   impressions with no clicks and drags CTR down). Enter one keyword and confirm "your ad is showing."

Expected result: non-zero impressions and a real Avg. CPC within 24-48 hours.

---

## 1. Campaign settings

| Setting | Value | Why |
|---|---|---|
| Campaign type | **Search** | NOT Performance Max. PMax sprays a small budget across YouTube, Display, Gmail and Discover, cannot be debugged, and needs a conversion diet we cannot feed. |
| Objective | **Create a campaign without a goal's guidance** | Choosing "Sales"/"Leads" makes Google push Smart Bidding, which cannot work with 0 conversions. |
| Networks | **Search partners OFF. Display Network OFF.** | Both default ON. Neither is a search test. |
| Locations | **United States** | |
| Location options | **Presence: people in your targeted locations** | The default "Presence or interest" bills for clicks from anywhere on earth who merely searched about the US. |
| Languages | English | |
| Bidding | **Maximize Clicks with a max CPC cap.** Consumer cap **$10**, B2B cap **$14** to start. | Maximize Clicks needs no conversion history. **Do NOT switch to Maximize Conversions / Target CPA until 15-30 conversions exist** (this is what killed the first run). |
| Budget | Consumer **$15/day**; B2B **$20/day**. Run 21 days, end date in a calendar. | |
| Ad rotation | Do not optimize: rotate indefinitely | With this little traffic, Google's rotation "optimization" is noise. |
| Auto-apply recommendations | **OFF** | On by default. It will switch you to Maximize Conversions, add broad match, and re-opt you into Search partners on its own. **The single biggest money leak in a small account, and half of why the first run died.** |

### Final URL suffix (do NOT skip this)

Campaign settings -> Additional settings -> **Campaign URL options -> Final URL suffix**:

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}
```

Auto-tagging appends the `gclid`, but **not** the UTMs. Without this suffix, `utm_term` lands `null`
in the `subscriptions` table and *"which keyword actually bought a subscription"* has no answer.

---

# Campaign 1: Consumer

Four ad groups to start (add Teacher / Family / Friend / Organizer later from `src/data/modes.ts`).
Each ad group's **Final URL is its own mode page, never the homepage.** Keywords are **phrase match
(in quotes) + broad match**; the campaign-level negatives keep broad match clean. Pin nothing in the
RSAs; let Google mix headlines.

## 1.1 Ad group: Manager

**Final URL:** `https://solutionseeking.com/practice/modes/manager`

**Keywords:**

```
"difficult conversation with employee"
"how to give difficult feedback"
"how to talk to an employee about performance"
"how to tell an employee they need to improve"
"prepare for a difficult conversation at work"
"performance conversation with employee"
"how to give feedback to an employee"
"first time manager hard conversation"
```

**Headlines (15):**

```
Prepare the Hard Conversation
Talk It Through First
For First-Time Managers
Say It Without the Damage
Try It Free, No Signup
Not a Script. A Method.
Feedback That Actually Lands
Before You Talk to Your Report
Rehearse the Tough One
Built to Run a Real Company
The Talk You Keep Putting Off
Performance Talk, Done Right
Think It Through, Then Speak
A Guide for Hard Feedback
Understand, Then Speak
```

**Descriptions (4):**

```
Think it through with a guide that asks what you have not asked yourself. Free to try.
Three steps: understand yourself, understand them, then find a solution together.
No account needed. Type your situation and see where it goes.
Built by the founders of a worker-directed cafe to run their own company.
```

## 1.2 Ad group: Co-worker

**Final URL:** `https://solutionseeking.com/practice/modes/coworker`

**Keywords:**

```
"how to deal with a difficult coworker"
"coworker takes credit for my work"
"how to confront a coworker professionally"
"conflict with a coworker"
"coworker not doing their share"
"how to talk to a coworker about a problem"
```

**Headlines (15):**

```
Work It Out With a Co-worker
No Drama, No Escalation
Before You Go to Your Manager
Try It Free, No Signup
Talk It Through First
When a Peer Keeps Dropping It
Say It Without the Damage
Not a Script. A Method.
Free to Try, No Account
Test the Story You Are Telling
Keep the Relationship Working
The Awkward Conversation
A Guide for Peer Conflict
Prepare, Then Have the Talk
Built to Run a Real Company
```

**Descriptions (4):**

```
Test the story you are telling about them, then prepare a low-drama conversation.
No authority in either direction. Just influence, good faith, and a working relationship.
No account needed. Type your situation and see where it goes.
Three steps: understand yourself, understand them, then find a solution together.
```

## 1.3 Ad group: Partner

**Final URL:** `https://solutionseeking.com/practice/modes/partner`

**Keywords:**

```
"recurring fight with my partner"
"same argument with my partner"
"how to talk to my partner about a problem"
"how to bring up an issue with my partner"
"how to stop fighting with my partner"
"communication problems in my relationship"
```

**Headlines (15):**

```
The Fight That Keeps Coming
Work It Out Together
Talk It Through First
Try It Free, No Signup
The Same Argument Again?
Say It So They Can Hear It
Not a Script. A Method.
Before the Next Blowup
Free to Try, No Account
Repair a Bad Moment
Prepare the Hard Talk
For Couples Who Feel Stuck
Understand, Then Speak
The Thing You Cannot Raise
A Guide for Real Conflict
```

**Descriptions (4):**

```
Understand what the recurring fight is really about, then prepare the conversation.
Three steps: understand yourself, understand them, then find a solution together.
No account needed. Type your situation and see where it goes.
Leave with an arrangement you will both actually keep.
```

## 1.4 Ad group: Parent

**Final URL:** `https://solutionseeking.com/practice/modes/parent`

**Keywords:**

```
"how to talk to my teenager"
"my teenager will not talk to me"
"hard conversation with my child"
"same fight about screens"
"how to talk to my kid about behavior"
"parenting difficult conversations"
```

**Headlines (15):**

```
The Hard Talk With Your Kid
Prepare, Then Talk
For Parents of Teens
Try It Free, No Signup
The Same Fight, Again?
Screens, Chores, Homework
Not a Script. A Method.
When They Stop Talking
Free to Try, No Account
Repair It the Right Way
Talk It Through First
A Plan Your Family Keeps
Understand, Then Speak
Lost Your Temper? Repair It
A Guide for Hard Talks
```

**Descriptions (4):**

```
Work through a hard conversation with your child, adapted to their age.
Three steps: understand yourself, understand them, then find a solution together.
No account needed. Type your situation and see where it goes.
Leave with a plan that actually fits your family.
```

---

# Campaign 2: Business / Teams (NEW)

Sells the team offering. **Final URL for every ad group: `https://solutionseeking.com/for-business`**
(the "Talk to us" CTAs there land on the team enquiry form at `/pricing#team`; the conversion is
`team_enquiry_submitted`). Its own **$20/day** budget and **$14** CPC cap so it never competes with
Campaign 1. B2B intent is worth chasing as leads, unlike the consumer test.

**One RSA is shared across the B2B ad groups** (below); each ad group differs only by keywords.

**Shared B2B headlines (15):**

```
Bring SSS to Your Team
One Workspace for Teams
AI Assistants for Teams
Trained on Your Documents
Your Domain, Your Brand
White-Label AI Assistant
No Engineering Required
Team Communication Tools
Assistants That Know You
Set Up in Minutes
Share It Across the Org
For Co-ops and Small Teams
Talk to Us About Seats
Built by a Real Co-op
Consistent, On-Brand Answers
```

**Shared B2B descriptions (4):**

```
Give your whole team a shared dashboard, AI assistants, and documents in one place.
Build assistants grounded in your own playbooks and share them across the company.
Put a branded assistant on your own domain. Self-serve setup, automatic HTTPS.
Tell us about your team, from seats to a white-label page on your own domain.
```

## 2.1 Ad group: Team communication training

```
"team communication training"
"workplace communication training"
"communication training for managers"
"communication skills training for teams"
```

## 2.2 Ad group: Workplace conflict resolution

```
"workplace conflict resolution training"
"conflict resolution training for teams"
"manager training for difficult conversations"
"how to handle conflict on my team"
```

## 2.3 Ad group: AI assistant for teams

```
"ai assistant for teams"
"custom ai agent for business"
"ai assistant trained on our documents"
"internal ai assistant for company"
```

## 2.4 Ad group: White-label AI

```
"white label ai assistant"
"white label ai chatbot"
"branded ai assistant on our domain"
```

---

## 3. Negative keywords

**Campaign 1 (consumer), campaign level, day one:**

```
pdf             template        script          letter
jobs            salary          hiring          fire
firing          termination     write up        lawsuit
attorney        lawyer          hr complaint    reddit
meme            chatgpt         quotes          resign
quit            union grievance
```

`letter`, `write up`, `termination` and `hr complaint` are **HR-paperwork intent**, not
conversation-prep intent. They look relevant, they are not, and they will spend real money.

**Removed `free` (was here before).** The whole funnel is "free to try" and the ads say "Try It
Free"; blocking `free` fought our own value prop and suppressed volume. Do not add it back.

**Campaign 2 (B2B), campaign level:** `free`, `jobs`, `salary`, `resume`, `course`, `certification`,
`reddit`, `chatgpt`, `open source`, `download`. (B2B searchers hunting a free course or a download
are not buyers of a seated product.)

---

## 4. Extensions (assets)

**Sitelinks** (text / description / URL):

| Text | Description | URL |
|---|---|---|
| See a real example | A full annotated conversation | `/practice/demos` |
| For business | A dashboard and assistants for teams | `/for-business` |
| Common questions | What it is, what is free, privacy | `/faq` |
| The 12 principles | The values behind the method | `/principles` |
| Free complete guide | The whole system as a PDF | `/guide` |
| Pricing | Most of it is free forever | `/pricing` |

(On Campaign 2, lead with **For business**, **Common questions**, **Pricing**, and drop the guide/
principles sitelinks if you want the account to weight the B2B ones.)

**Callouts:** `No account needed` · `Free to try` · `Cancel anytime` · `Built by a real co-op` ·
`3 free messages`

---

## 5. Launch / relaunch checklist

- [ ] Bidding = **Maximize Clicks with a CPC cap** ($10 consumer / $14 B2B), **not** Smart Bidding
- [ ] **Auto-apply recommendations OFF** (re-check; Google re-enables it)
- [ ] Search partners OFF, Display OFF (re-check after saving; Google likes to re-tick these)
- [ ] Location = **Presence**, not "presence or interest"
- [ ] **Final URL suffix set** (or `utm_term` is null forever)
- [ ] Final URLs point at the mode pages (Campaign 1) / `/for-business` (Campaign 2), not the homepage
- [ ] Negatives added at campaign level (consumer list without `free`; B2B list)
- [ ] Daily budget set, end date in a calendar
- [ ] Billing active, ads show **Approved**
- [ ] **Ad Preview & Diagnosis** shows the ad serving for one keyword in each campaign
- [ ] Click your own ad once from a phone, confirm the landing page loads with `?gclid=` in the URL.
      That single click proves the whole chain.

---

## 6. What to watch, and when

**Do not touch anything for the first 7 days** beyond adding negatives. Small accounts get wrecked by
daily fiddling. Then, at day 7 and day 21, in Ads:

- **Impression share** and **Avg. CPC** first (are we even in the auction now?)
- **Cost per "started a conversation"** (`first_message_sent`, the consumer Primary conversion)
- **Team enquiries** (`team_enquiry_submitted`) for Campaign 2
- **Search terms report** -> add negatives for anything irrelevant. The one weekly job worth doing.

And in the database, the question Ads cannot answer:

```sql
-- Which keyword actually bought a subscription?
select utm_term, landing_path, count(*) as subscriptions
from public.subscriptions
where click_id is not null
group by 1, 2
order by 3 desc;

-- Which keyword produced an email address?
select source, status, count(*) from public.email_subscribers group by 1, 2;
```

## The decision rules (write the answer down BEFORE spending)

**Campaign 1 (consumer):**
- **Spend more if** cost per started conversation is **under ~$12** AND at least **10% of starters**
  give an email or create an account.
- **Stop if** cost per start is **over $25**, or **under 5% of clicks** start a conversation.
- **Do not judge on subscriptions.** Zero to two is the expected outcome and tells you nothing.

**Campaign 2 (B2B):**
- Judge on **cost per team enquiry** (`team_enquiry_submitted`). One real multi-seat team pays back a
  lot of clicks, so a materially higher cost per lead than the consumer side is fine here.
- **Stop an ad group if** it spends ~$150 with zero enquiries and its search-terms report shows the
  intent is wrong (job seekers, students, free-course hunters) rather than buyers.
