import { Plugin, Skill } from "@opencode/plugin"
import { createHash } from "node:crypto"
import { readFile, realpath } from "node:fs/promises"
import { relative, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"
import registration from "./registration.json" with { type: "json" }

// The host owns transports, credentials and registration lifetimes. This module
// contributes definitions only; its generated data comes from the shared skills.
export default Plugin.define({
  id: registration.plugin_id,
  async setup(ctx) {
    const version = /^v?(\d+)\.(\d+)\.(\d+)(?:$|[-+])/.exec(ctx.app.version)
    if (!version || Number(version[1]) !== 2 ||
        (Number(version[2]) < 2 || (Number(version[2]) === 2 && Number(version[3]) < 5))) {
      throw new Error("Fotor requires OpenCode v2.2.5 or a compatible later v2 client.")
    }
    const root = await realpath(fileURLToPath(new URL("../", import.meta.url)))
    const skills = await Promise.all(registration.skills.map(async (entry) => {
      if (!/^skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md$/.test(entry.path)) {
        throw new Error("Fotor has an invalid bundled skill path.")
      }
      const path = await realpath(fileURLToPath(new URL(`../${entry.path}`, import.meta.url)))
      const inside = relative(root, path)
      if (inside.startsWith("..") || isAbsolute(inside)) {
        throw new Error("Fotor skill resources must remain inside the installed package.")
      }
      const bytes = await readFile(path)
      if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
        throw new Error(`Fotor bundled skill changed: ${entry.id}. Reinstall the complete package.`)
      }
      return Skill.Info.make({
        id: Skill.ID.make(entry.id),
        name: Skill.Name.make(entry.name),
        description: entry.description,
        path: Skill.Info.fields.path.make(path),
        content: entry.content,
      })
    }))
    const owned: Array<{ dispose(): Promise<void> }> = []
    const dispose = async () => {
      for (const item of owned.splice(0).reverse()) await item.dispose()
    }
    try {
      owned.push(await ctx.skill.transform((editor) => {
        for (const skill of skills) {
          const existing = editor.get(skill.id)
          if (existing && existing.path !== skill.path) {
            throw new Error(`Fotor skill ID already belongs to another source: ${skill.id}. Review native skill sources.`)
          }
        }
        for (const skill of skills) if (!editor.get(skill.id)) editor.add(skill)
      }))
      owned.push(await ctx.mcp.transform((editor) => {
        for (const [name, config] of editor.list()) {
          if (name !== registration.server_name && config.type === "remote" &&
              config.url === registration.server.url) {
            throw new Error("Fotor MCP is already configured under another name. Review native MCP sources.")
          }
        }
        const existing = editor.get(registration.server_name)
        if (existing) {
          if (existing.type !== "remote" || existing.url !== registration.server.url) {
            throw new Error("The Fotor MCP name belongs to a different service. Preserve it and resolve the conflict in native settings.")
          }
          return
        }
        editor.set(registration.server_name, {
          type: "remote",
          url: registration.server.url,
          codemode: registration.server.codemode,
        })
      }))
    } catch (error) {
      await dispose()
      throw error
    }
    return dispose
  },
})
