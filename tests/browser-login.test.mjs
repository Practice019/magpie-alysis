// 受控浏览器登录：候选排序、pickCookie、等文件。真启动浏览器不在单测里跑。
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const { browserCandidates, findBrowser, selectCookies, waitForFile } = await import("../src/browser-login.mjs")

test("Windows 候选：注册表命中优先，Chrome 在 Edge 前，国产浏览器在列", () => {
  const env = {
    LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local",
    APPDATA: "C:\\Users\\x\\AppData\\Roaming",
    PROGRAMFILES: "C:\\Program Files",
    "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
  }
  const lookup = (exe) => (exe === "360ChromeX.exe" ? "C:\\360\\360ChromeX.exe" : "")
  const list = browserCandidates({ platform: "win32", env, lookup })
  const names = list.map((b) => b.name)
  assert.equal(list[0].path, "C:\\360\\360ChromeX.exe", "注册表命中的 360 极速应排最前")
  assert.ok(names.indexOf("Chrome") < names.indexOf("Edge"), "Chrome 在 Edge 之前")
  assert.ok(names.some((n) => n.includes("QQ")), "QQ 浏览器在候选里")
  assert.ok(list.every((b) => b.path), "候选不应有空路径")
})

test("findBrowser 只返回真实存在的候选；找不到返回 null", () => {
  const env = { PROGRAMFILES: "C:\\PF", LOCALAPPDATA: "C:\\L" }
  const chrome = join("C:\\PF", "Google", "Chrome", "Application", "chrome.exe")
  const found = findBrowser({
    platform: "win32",
    env,
    lookup: () => "",
    exists: (p) => p === chrome,
  })
  assert.equal(found.name, "Chrome")
  assert.equal(findBrowser({ platform: "win32", env, lookup: () => "", exists: () => false }), null)
})

// Linux 上浏览器是装在系统里的，~/.config/<vendor> 只是用户数据目录、里面没有
// 可执行文件。以前的候选把这五条 profile 目录当成了程序路径，findBrowser() 在
// Linux 上永远返回 null —— 两条登录路都死在「没有找到 Chromium 内核浏览器」。
test("Linux 候选：从 PATH 与系统目录找，绝不拿 ~/.config 的 profile 目录当程序", () => {
  const env = { HOME: "/home/u", PATH: "/usr/local/bin:/usr/bin:/bin" }
  const list = browserCandidates({ platform: "linux", env, exists: () => false })
  assert.ok(list.length > 0, "即使一个都没装，也要有候选路径可查")
  assert.ok(
    list.every((b) => !b.path.startsWith("/home/u/.config/")),
    "候选不能是 ~/.config 下的用户数据目录",
  )
  assert.ok(list.some((b) => b.path === "/usr/bin/chromium"), "系统目录里的 chromium 在候选里")
})

test("Linux：PATH 里找到的浏览器排在系统绝对路径之前", () => {
  const env = { HOME: "/home/u", PATH: "/snap/bin:/usr/bin" }
  const hit = "/snap/bin/chromium"
  const found = findBrowser({ platform: "linux", env, exists: (p) => p === hit })
  // 名字是给人看的：PATH 命中的 chromium 归成 "Chromium"，不是命令名本身
  assert.equal(found.name, "Chromium")
  assert.equal(found.path, hit)
  assert.equal(findBrowser({ platform: "linux", env, exists: () => false }), null)
})

test("selectCookies 只取需要的名字，忽略空值，拼成 Cookie header", () => {
  const cookies = [
    { name: "sid", value: "abc" },
    { name: "uid", value: "42" },
    { name: "other", value: "no" },
    { name: "empty", value: "" },
  ]
  assert.deepEqual(selectCookies(cookies, ["sid", "uid", "empty"]), {
    header: "sid=abc; uid=42",
    found: { sid: "abc", uid: "42" },
  })
  assert.deepEqual(selectCookies(null, ["sid"]), { header: "", found: {} })
})

test("waitForFile：文件出现返回 true，超时返回 false", async () => {
  const dir = mkdtempSync(join(tmpdir(), "magpie-browser-"))
  const file = join(dir, "ready")
  const pending = waitForFile(file, 500, 20)
  setTimeout(() => writeFileSync(file, "1"), 50)
  assert.equal(await pending, true)
  assert.equal(await waitForFile(join(dir, "missing"), 30, 10), false)
})
