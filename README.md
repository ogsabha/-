Og Sabha Hub

A student-made site with three parts:

1. **Food**: hostel menu by day and time, "serving now" highlight, 1-5 star ratings.
2. **Classes**: which period is on now, the teacher, and whether the teacher is present (updated by class reps).
3. **Wall**: anonymous posts, approved by an admin before they show.

Files:

| File | What it does |
|---|---|
| `index.html` | The page and its three tabs |
| `style.css` | Look and mobile layout |
| `app.js` | All the logic and the Firebase connection |
| `data/menu.json` | Hostel menu (sample data, replace it) |
| `data/timetable.json` | Class timetable (sample data, replace it) |
| `firestore.rules` | Security rules to paste into Firebase |

## Step 1: Try it on your computer

Browsers block `fetch()` on files opened by double-click, so run a tiny server.
In the project folder:

```
python3 -m http.server 8000
```

Open http://localhost:8000. The food and class tabs work already. Ratings,
teacher status and the wall stay off until Step 3.

## Step 2: Put in your real data

- `data/menu.json`: edit meal timings under `meals`, and the food for each day under `days`.
- `data/timetable.json`: edit `periods` (times in 24-hour format), then each class, day, period, subject and teacher.
  Add more classes by copying the `"Class A"` block and renaming it.

Keep the commas and quotes exactly as in the sample. If the page goes blank,
paste the file into jsonlint.com to find the mistake.

## Step 3: Connect Firebase (free)

1. Go to https://console.firebase.google.com and create a project (turn Google Analytics off).
2. Click the web icon (`</>`), register an app, and copy the `firebaseConfig` block.
3. Paste its values into the `firebaseConfig` section at the top of `app.js`.
   (These values are not secret. The rules in Step 4 are what protect your data.)
4. Build > **Firestore Database** > Create database > production mode > pick a nearby region (e.g. `asia-south1`).
5. Build > **Authentication** > Get started > enable **Email/Password**.
   Then Users > Add user for yourself (admin) and for each class rep.

## Step 4: Add the security rules

1. Firestore > **Rules** tab.
2. Open `firestore.rules`, replace the two example emails with the real admin and class rep emails, paste everything into the editor, and click **Publish**.

Without this step anyone could edit or delete your data.

## Step 5: Put it on GitHub Pages

1. Create a **public** repository on github.com (for example `dcsmat-hub`).
2. Upload all the files and the `data` folder (Add file > Upload files, drag the folder in), then commit.
   Do not upload `firestore.rules` with real emails in it.
3. Settings > **Pages** > Source: *Deploy from a branch* > branch `main`, folder `/ (root)` > Save.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/dcsmat-hub/`.
5. In Firebase > Authentication > Settings > **Authorized domains**, add `YOUR-USERNAME.github.io` so staff login works.

## How to use it day to day

- **Class rep**: open the site, tap *Staff / class rep login* at the bottom, log in, then use the *Mark present / absent* buttons under today's timetable.
- **Admin**: after logging in, the Wall tab shows a *Waiting for approval* list. Approve or delete. Posts with 3 or more reports are hidden from students automatically, and you can delete them.

## Important notes

- Ratings and the post limit are per device, so they stop casual spam but not a determined person.
- Keep approval switched on. An open anonymous wall tends to fill with bullying, and that can get the site taken down or cause trouble with the college.
- Rule for the wall: no naming or targeting individuals. Delete anything that does.
- Free Firebase limits are far above what one college will use.
