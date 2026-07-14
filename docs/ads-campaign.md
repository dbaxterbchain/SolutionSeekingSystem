# The Google Ads build sheet

Everything needed to build the first Search test, in the order the Ads UI asks for it.
Every asset below is inside Google's character limits (checked).

**Read this first:** the test **buys data, not customers**. At $5/month the CAC maths does not
close, and **zero to two subscriptions from $300 to $500 is the expected outcome**. Judge it on
**cost per started conversation**. See the decision rule at the bottom, and write your answer
down before you spend, not after.

Setup that must already be true (see [deployment.md](deployment.md#google-ads)): the GTM trigger
regex covers all 16 events, `checkout.stripe.com` is an unwanted referral in GA4, auto-tagging is
ON, GA4 is linked to Ads, and the four conversions are imported with `first_message_sent` as
**Primary, Count = One**.

---

## 1. Campaign settings

| Setting | Value | Why |
|---|---|---|
| Campaign type | **Search** | NOT Performance Max. "Asset groups" are a PMax concept: it sprays a small budget across YouTube, Display, Gmail and Discover, cannot be debugged, and needs a conversion diet we cannot feed. |
| Objective | **Create a campaign without a goal's guidance** | Choosing "Sales" or "Leads" makes Google push Smart Bidding at you. |
| Networks | **Search partners OFF. Display Network OFF.** | Both default ON. Neither is a search test, and both will quietly eat the budget. |
| Locations | **United States** | |
| Location options | **Presence: people in your targeted locations** | The default is "Presence or interest", which bills you for clicks from anywhere on earth who merely *searched about* the US. |
| Languages | English | |
| Bidding | **Manual: Maximize Clicks with a max CPC cap of $2.50** | Smart Bidding needs ~15-30 conversions/month to learn. You will have far fewer. With manual bidding the imported conversions are **measurement only**, which is exactly what is wanted. |
| Budget | **$15/day**, run 21 days (~$315) | Put the end date in a calendar. |
| Ad rotation | Do not optimize: rotate indefinitely | With this little traffic, Google's rotation "optimization" is noise. |
| Auto-apply recommendations | **OFF** (Recommendations page → Auto-apply → turn everything off) | On by default. It will switch you to Maximize Conversions, add broad match keywords, and opt you back into Search partners, on its own, and you will not notice. **This is the single biggest money leak in a small account.** |

### Final URL suffix (do NOT skip this)

Campaign settings → Additional settings → **Campaign URL options → Final URL suffix**:

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}
```

Auto-tagging appends the `gclid`, but **not** the UTMs. Without this suffix, `utm_term` lands
`null` in the `subscriptions` table and the whole point of the exercise, *"which keyword actually
bought a subscription"*, has no answer. `{keyword}` is the ValueTrack parameter for the keyword
that matched.

---

## 2. Ad group: Manager

**Final URL:** `https://solutionseeking.com/practice/modes/manager`  (never the homepage)

**Keywords** (phrase match, i.e. in quotes; add exact `[...]` later once you see what converts):

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

**Responsive Search Ad. Headlines (15):**

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
Free to Try, No Account
The Talk You Keep Putting Off
Performance Talk, Done Right
Think It Through, Then Speak
A Guide for Hard Feedback
```

**Descriptions (4):**

```
Think it through with a guide that asks what you have not asked yourself. Free to try.
Three steps: understand yourself, understand them, then find a solution together.
No account needed. Type your situation and see where it goes.
Built by the founders of a worker-directed cafe to run their own company.
```

Pin nothing. Let Google mix them; that is what an RSA is for.

---

## 3. Ad group: Co-worker

**Final URL:** `https://solutionseeking.com/practice/modes/coworker`

**Keywords** (phrase match):

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

---

## 4. Negative keywords (campaign level, day one)

```
free            pdf             template        script
letter          jobs            salary          hiring
fire            firing          termination     write up
lawsuit         attorney        lawyer          hr complaint
reddit          meme            chatgpt         quotes
resign          quit            union grievance
```

`letter`, `write up`, `termination` and `hr complaint` are **HR-paperwork intent**, not
conversation-prep intent. They look relevant, they are not, and they will spend real money.

---

## 5. Extensions (assets)

**Sitelinks** (text / description / URL):

| Text | Description | URL |
|---|---|---|
| See a real example | A full annotated conversation | `/practice/demos` |
| The 12 principles | The values behind the method | `/principles` |
| Free complete guide | The whole system as a PDF | `/guide` |
| Pricing | Most of it is free forever | `/pricing` |

**Callouts:** `No account needed` · `Free to try` · `Cancel anytime` · `Built by a real co-op` ·
`3 free messages`

---

## 6. Launch checklist

- [ ] Search partners OFF, Display OFF (check again after saving; Google likes to re-tick these)
- [ ] Location = **Presence**, not "presence or interest"
- [ ] Bidding = Maximize Clicks **with a CPC cap**
- [ ] **Final URL suffix set** (or `utm_term` is null forever)
- [ ] **Auto-apply recommendations OFF**
- [ ] Final URLs point at the mode pages, not the homepage
- [ ] Negatives added at campaign level
- [ ] Daily budget $15, end date in a calendar
- [ ] Click your own ad once from a phone, and confirm the landing page loads with `?gclid=` in
      the URL. That single click proves the whole chain.

---

## 7. What to watch, and when

**Do not touch anything for the first 7 days.** Small accounts get wrecked by daily fiddling.

At day 7 and day 21, in Ads:
- **Cost per "started a conversation"** (this is `first_message_sent`, the Primary conversion)
- Search terms report → add negatives for anything irrelevant. This is the one job worth doing
  weekly, and it is where most of the savings are.

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

## The decision rule (write the answer down BEFORE spending)

- **Spend more if** cost per started conversation is **under ~$12** AND at least **10% of
  starters** give an email or create an account. That means strangers will use it and the funnel
  holds.
- **Stop if** cost per start is **over $25**, or **under 5% of clicks** start a conversation.
  That means the keyword-to-page match is wrong, and no amount of bid tuning fixes it.
- **Do not judge on subscriptions.** Zero to two is the expected outcome and tells you nothing
  either way. If you find yourself reading meaning into one sale, stop and re-read this line.
