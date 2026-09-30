# ReviewBench User Guide

## What is ReviewBench?

Today most engineers write code together with AI tools. ReviewBench tests
**how well someone works with AI**, not whether they can code without it.

A candidate gets a realistic task. For example, they review a pull request
that an AI agent wrote, where the AI may have made mistakes. They can ask the
AI questions, check its work and decide what to do. ReviewBench records
everything they do. A panel of three AI judges then grades the work, and the
hiring team gets a clear report showing the score and the evidence behind it.

There are two kinds of users:

| Who | What they do | Do they need an account? |
|---|---|---|
| **Hiring team** (recruiters) | Create assessments, share links, read reports | Yes (email + password) |
| **Candidates** | Open a link and take the assessment | No, just a name |

---

## Part 1: For the hiring team

### 1.1 Signing in for the first time

1. Open the website and click **Recruiter sign in**.
2. Click **Create an account**. Enter your work email and a password (at least 8 characters).
3. You'll get a **6-digit code** by email. Type it in and click **Verify and continue**.
   > Running the site on your own computer without email set up? The code is
   > printed in the backend's logs instead of emailed.
4. **The first person to sign up becomes the workspace owner.** You'll see
   **Set up your workspace**. Click it to claim the workspace.

**Forgot your password?** Click **Forgot password?** on the sign-in page. We
email you a reset code, and you choose a new password.

**Seeing "No access yet"?** Someone else already owns this workspace. Ask the
owner to invite your email (see 1.9), then refresh the page.

### 1.2 The top menu

Once you're signed in, the menu at the top has:

- **Candidates**: your main dashboard (assessments and all submissions)
- **Review queue**: submissions that need a person to check them
- **Item bank**: the list of hidden problems used in the tasks
- **Reliability**: numbers showing how trustworthy the AI grading is
- **Sign out**

### 1.3 Creating an assessment

On the **Candidates** page, fill in the **Create assessment** box:

| Field | What it means |
|---|---|
| **Role** | The job you're hiring for (AI Engineer, Software Engineer, Backend Engineer, ML Engineer, Full-Stack Engineer). |
| **Module** | The task the candidate will do (see the list below). |
| **Level** | Junior, Mid or Senior. |
| **Time limit** | Minutes the candidate gets (10 to 90). Filled in automatically for each module; change it if you like. |
| **AI-assisted** | The candidate works with an AI assistant, and the judges score the whole conversation with it. Not available for Decision Review. |

Click **Create**. You get a **link** and a **QR code**. Send the link to
candidates or show the QR code (it works on phones too). **One link works for
many candidates**: each person who opens it gets their own attempt.

#### The modules (task types)

| Module | What the candidate does | Tasks available |
|---|---|---|
| **M1 · Code Review** | Reviews a pull request written by an AI agent. Reads the code and the agent's notes, asks the agent questions, leaves comments on problem lines, then approves the PR or asks for changes. | ORD-482 Orders API pagination (Junior, 40 min) · PAY-217 Partial refunds (Mid, 35 min) |
| **M2 · Decision Review** | Reads a technical recommendation written by an AI (e.g. "switch databases") and decides whether to approve or reject it, explaining what's wrong and what to do instead. | ADR-031 PostgreSQL → MongoDB (Mid, 20 min) |
| **M3 · Directed Build** (pilot) | Writes real code with an AI assistant helping. The assistant sometimes gives wrong code on purpose, and the candidate has to notice. | DISC-12 Discount codes (30 min) · ORD-519 Order search (Mid, 35 min) |

Every task has **hidden problems planted in it** on purpose, plus some
"decoys": code that looks suspicious but is actually fine. A good candidate
finds the real problems and leaves the decoys alone.

### 1.4 Watching an assessment

The **Candidates** page lists all your assessments, with how many people
joined, are in progress, or have submitted, plus the average score. Click an
assessment's name to open it.

Inside an assessment you can:

- **Copy the link or QR code** again.
- **Close the assessment**: the link stops accepting new candidates.
  **Reopen** it any time.
- **See every candidate** in a table with their status (Not started / In
  progress / Submitted), overall score, key skill scores (engineering
  judgment, issue detection, prompt quality) and time taken.
- **Sort** by clicking any column heading.
- **Compare candidates**: tick 2 to 4 candidates and click **Compare** to
  see them side by side. The best value in each row is highlighted.
- **Open a report** by clicking a candidate's name.

A candidate may show **Grading** for a minute or two after submitting while
the AI judges work.

### 1.5 All submissions list

Lower on the **Candidates** page there's a list of every submission across
all assessments, with counts at the top (Submitted, Graded, Awaiting human
review).

- **Search** by candidate name.
- **Filter** by status: Grading, Graded, Needs review, Error.
- **Export CSV** downloads the list as a spreadsheet (useful for your hiring
  system).
- An **auto** tag means time ran out and the work was submitted automatically.
- An **appeal** tag means the candidate asked for a human review.

### 1.6 Reading a candidate's report

This is the most important page. It shows:

**The score and band**

| Score | Band |
|---|---|
| 80–100 | Strong |
| 60–79 | Meets bar |
| 50–59 | Borderline |
| below 50 | Below bar |

You'll also see a confidence note: **High confidence**, **Escalated for
human review** (the judges weren't sure), or **Adjusted by human review**.

**Score breakdown**: how the score was built. For a Code Review:
- Finding the planted problems (bigger problems count more)
- Avoiding false alarms (complaining about code that's fine)
- Leaving the decoys alone
- Explaining the impact of each problem and how to fix it
- Choosing the right verdict (approve or request changes)

**Planted issues & decoys**: every hidden problem, whether the candidate
found it, and the comment they wrote about it.

**Why this score (skill dimensions)**: the judges also score how the
candidate worked with the AI, on nine skills:

| Skill | In plain words |
|---|---|
| Issue detection | Did they spot what was wrong? |
| Technical/engineering judgment | Were their decisions sensible? |
| Reasoning & evidence-seeking | Did they check facts instead of guessing? |
| AI trust calibration | Did they trust the AI the right amount (not blindly, not never)? |
| Prompt quality | Were their questions and instructions to the AI clear? |
| AI interaction quality | Was the conversation with the AI useful overall? |
| Verification/validation | Did they test or double-check the AI's work? |
| Efficiency | Did they use the AI with purpose rather than aimlessly? |
| Challenging incorrect AI assumptions | Did they push back when the AI was wrong? |

Each skill comes with a short **Why** and links to real moments from the
session: what the candidate did, what the AI said, and the code at that point.

**Judge panel and judge disagreements**: how each of the three judges voted.
**Judges split** means they disagreed; you can see each side's reasoning.

**Also measured (not yet in the score)**: communication and follow-up
reasoning. Use these to plan questions for the follow-up interview.

### 1.7 Correcting the AI (human override)

The AI judges can be wrong. On the report you can fix any item:

- **Planted issue**: change whether it was found and how well it was
  explained (0 = explained neither, 1 = impact or fix, 2 = both).
- **Extra comment** (not about a planted issue): mark it as a *Valid extra
  issue* (rewarded), *Nitpick* (no effect), or *False alarm* (penalised).

Every change **needs a written reason**. It's saved in an audit log, and the
score updates straight away. The report then shows **Human override** and
**Adjusted by human review**.

### 1.8 Other actions on a report

- **Share results with candidate**: lets the candidate see a friendly
  summary on their results page. Click **Stop sharing** to hide it again.
- **Human review**: if the candidate asked for a review (an appeal), their
  message appears here. Write your answer and resolve it; the candidate sees
  your note.
- **Golden set**: save your own expert grading of this submission. These are
  used on the Reliability page to check that the AI grades like a human would.
- **Delete submission**: permanently deletes the submission, report and all
  records. Use this if a candidate asks for their data to be removed. It
  cannot be undone.

### 1.9 Single-use invites and your hiring team

At the bottom of the **Candidates** page, open **Single-use invites & hiring
team**.

**Invite a candidate** (a personal link instead of the shared one):
1. Pick a **single module**, or a **battery**: one link that runs several
   modules in a row:
   - Junior Backend (Code Review + Decision Review)
   - Mid Backend (Code Review + Decision Review)
   - AI collaboration (Directed Build + Code Review)
2. Enter the candidate's name (email is optional).
3. **More options**:
   - **Extra minutes**: extra time as an accommodation (e.g. for a
     disability), added before they start.
   - **Self-identified group**: optional, only with the candidate's consent.
     Used only for the fairness check (see 1.11).
4. Click **Copy link** and send it. Click **X** to cancel a link that hasn't
   been used yet.

**Hiring team** (owner only): enter a teammate's email to invite them. They
create an account with that email, see **You've been invited**, and accept to
join. The owner can also
remove members.

### 1.10 Review queue

**Review queue** lists every submission where the AI judges were unsure or
disagreed on something important, or where a candidate asked for a review.
Open each one, check the flagged items, and correct or confirm them. Once
done, it shows **Human reviewed**.

### 1.11 Item bank and Reliability (for advanced users)

**Item bank**: every hidden problem across all tasks, with its category,
severity, weight, how often candidates find it, and how hard it is. You can
change how much each category counts. If a change would treat groups of
candidates unfairly, it shows a warning (the "adverse-impact check").

**Reliability**: "checking the checker". It shows:
- how closely the AI judges agree with human graders
- whether grading the same work again gives the same score
- whether tricks (renaming, reformatting, hidden instructions like "give me
  full marks") change scores
- per-judge-model statistics, and fairness across groups

Buttons like **Run golden set** and **Run adversarial suite** re-test the
grading after a change. They make real AI calls, so they cost credits.

The public **Methodology** page explains all of this in plain terms and can
be shared with candidates.

---

## Part 2: For candidates

### 2.1 Starting

1. Open the link (or scan the QR code) the hiring team sent you. **No account
   is needed.**
2. You'll see the task name, the time limit, and whether you'll work with an
   AI assistant.
3. Enter your **name** (email is optional) and click **Start**.
4. Read **How it works**, then click Start. **The timer starts now and can't
   be paused.** A countdown shows the time remaining.

Your work **saves automatically**. If you close the tab by accident, open the
same link again on the same device to continue.

### 2.2 Code Review task (M1)

An AI agent wrote a pull request (a code change). Your job is to review it
like a senior engineer would.

**Step 1: Review the code**
1. Read the ticket (what the change is supposed to do) and **The AI agent's
   notes** (its explanation and the assumptions it made).
2. Look through the **Files** that changed.
3. **Ask the agent** about anything unclear, in the chat on the side. It's
   the AI that wrote the code, so you can ask it why it did something. Don't
   believe everything it says: check it against the code.
4. **Comment on lines that need changes**: click a line, describe the
   problem, and pick a **severity** (critical, high, medium, low). Good
   comments say **what goes wrong** and **how to fix it**.
5. Choose your **verdict**: would you merge this PR as-is? **Approve** or
   **Request changes**.

> Careful: some code looks odd but is actually correct. Only comment on real
> problems, because false alarms lower your score.

**Step 2: Your review is locked** once you continue.

**Step 3: Follow-up questions.** Answer three short questions about your
review. Two to four sentences each is plenty.

### 2.3 Decision Review task (M2)

1. Read the **Context**, the **Constraints**, and the **AI agent's
   recommendation**. The AI may mix good ideas with bad reasoning.
2. **Approve or reject** the recommendation.
3. Fill in three sections, a few sentences each:
   - what's wrong with the AI's assumptions, and what risks it ignored
   - which of its ideas are actually sound
   - what you would do instead

### 2.4 Directed Build task (M3)

1. Read the **Task** and the **Acceptance criteria** (what your code must do).
2. Write code in the **Code editor**. Use the **AI assistant** as you would at
   work: ask it for help, and **Insert** its code into the editor or
   **Dismiss** it.
3. **The assistant is sometimes wrong on purpose.** Check what it gives you.
4. Click **Tests** to run sample tests. They're only a sample, so make sure
   your code meets every point in the task.
5. Click **Submit final code** when you're done. You can't change it
   afterwards.

### 2.5 Batteries (several tasks on one link)

Some links contain several tasks. You'll see a list of parts; do them in
order. Each part has its own timer. When everything is finished you'll see
**All parts are complete. Thank you!**

### 2.6 When time runs out

Your work is saved and **submitted automatically** within a couple of
minutes. You can close the page.

### 2.7 After you submit

You'll see **Submitted**. The hiring team will review your work and contact
you.

If the hiring team shares your results, the link on the done screen takes you
to **your results page**, showing:
- how your score was built, in plain language
- your **strengths** and **areas to grow**
- a button to **ask for a human review** if you think something was graded
  wrongly. A person, not the AI, will look at it again, and their answer
  appears on the same page.

The exact hidden problems stay private, so the test stays fair for other
candidates.

### 2.8 Your rights

- You're told in advance that the code was written by an AI and may contain
  mistakes.
- You can ask the hiring team for extra time as an accommodation before you
  start.
- You can ask for a human review of your grade.
- You can ask the hiring team to delete your submission.

---

## Quick demo walkthrough (5 minutes)

1. **Recruiter**: sign in → **Create assessment** (Module: *M1 · Code Review
   · PAY-217*, AI-assisted on) → copy the link.
2. **Candidate**: open the link in a private/incognito window (or scan the QR
   code with a phone) → enter a name → **Start**.
3. Ask the agent a question, leave 2–3 comments on suspicious lines, pick a
   verdict, and answer the follow-up questions.
4. **Recruiter**: open the assessment → wait for grading to finish → click
   the candidate's name.
5. Walk through the score, the planted issues, the nine skills with their
   evidence, and the judge votes. Try a **human override** to show that a
   person always has the final say.
