import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "dist-tv");
const sharedFiles = ["channel-forge-icon.svg", "client.js", "styles.css"];

await rm(outDir, { force: true, recursive: true });
await buildSamsungTizen();
await buildLgWebOs();

console.log("TV packages generated in dist-tv/");

async function buildSamsungTizen() {
  const target = join(outDir, "samsung-tizen");
  await copySharedWebApp(target);
  await writeFile(
    join(target, "config.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="cloud.channelforge.player" version="1.0.0" viewmodes="maximized">
  <tizen:application id="cloud.channelforge.player" package="cloud.channelforge" required_version="5.5"/>
  <content src="index.html"/>
  <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
  <icon src="channel-forge-icon.svg"/>
  <name>ChannelForge</name>
  <description>Bring-your-own legal M3U playlist player.</description>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <tizen:profile name="tv-samsung"/>
</widget>
`,
  );
  await writeFile(
    join(target, "README.md"),
    `# ChannelForge for Samsung Tizen TV

This folder is a public-safe Tizen web app scaffold. Import it into Tizen Studio, test on the TV emulator or a real developer-mode TV, then package/sign through Samsung's TV tooling.

No playlists or streams are bundled. Users must provide legal M3U sources.
`,
  );
}

async function buildLgWebOs() {
  const target = join(outDir, "lg-webos");
  await copySharedWebApp(target);
  await writeFile(
    join(target, "appinfo.json"),
    `${JSON.stringify(
      {
        id: "cloud.channelforge.player",
        version: "1.0.0",
        vendor: "ChannelForge",
        type: "web",
        main: "index.html",
        title: "ChannelForge",
        icon: "channel-forge-icon.svg",
        largeIcon: "channel-forge-icon.svg",
        appDescription: "Bring-your-own legal M3U playlist player.",
        resolution: "1920x1080",
      },
      null,
      2,
    )}
`,
  );
  await writeFile(
    join(target, "README.md"),
    `# ChannelForge for LG webOS TV

This folder is a public-safe webOS TV app scaffold. Package it with the webOS TV CLI, test with Developer Mode or the emulator, then submit through LG's review process.

No playlists or streams are bundled. Users must provide legal M3U sources.
`,
  );
}

async function copySharedWebApp(target) {
  await mkdir(target, { recursive: true });
  for (const file of sharedFiles) await cp(join(root, file), join(target, file));
  await cp(join(root, "tv", "tv-remote.js"), join(target, "tv-remote.js"));
  await cp(join(root, "tv", "tv.css"), join(target, "tv.css"));
  const html = await readFile(join(root, "index.html"), "utf8");
  await writeFile(join(target, "index.html"), injectTvAssets(html));
}

function injectTvAssets(html) {
  return html
    .replace("</head>", '    <link rel="stylesheet" href="./tv.css" />\n  </head>')
    .replace("</body>", '    <script src="./tv-remote.js"></script>\n  </body>');
}
