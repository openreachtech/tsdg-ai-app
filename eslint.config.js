import {
  coreConfig,
  eslintCommentsPluginConfig,
  jsdocPluginConfig,
  openreachtechPluginConfig,
  stylisticPluginConfig,
} from '@openreachtech/eslint-config'

export default [
  coreConfig,

  stylisticPluginConfig,

  jsdocPluginConfig,

  eslintCommentsPluginConfig,

  openreachtechPluginConfig,

  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
      },
      sourceType: 'module',
    },
  },

  {
    ignores: [
      '**/node_modules/**',

      // Scratch space. `.gitignore` already excludes it, but flat config does
      // not read `.gitignore`, so without this entry a throwaway script left
      // here fails `npm run lint` locally while CI — which never checks out an
      // ignored directory — stays green, and nothing points at the cause.
      '.scratch/',

      // Implementation repositories. Each one lints itself, under its own
      // config. A repository adopted under its own directory name matches
      // neither pattern below, so /hora-setup appends one literal entry per
      // declared `Directory` right after them.
      '*-backend*/',
      '*-frontend*/',

      // The kit equipped by postinstall, from @openreachtech/hora and the four
      // @openreachtech/hora-skills-ort-* packages. Not authored here, and some of the skills
      // ship .js/.mjs/.cjs. Both payload directories are ignored whole, the way
      // .gitignore does it: a denylist written against the names the packages
      // use today says nothing when it stops matching. The skill this repository
      // authors lives at kit/skills/, and the hook places a copy here like any
      // other, so nothing has to be named back in.
      '.claude/agents/',
      '.claude/skills/',

      // Code extracted from the ported services, carried in the specification's
      // annex so a reader can see what the version is replacing. Not authored
      // here and not maintained here: it is evidence about somebody else's
      // repository, which lints itself under its own config, exactly as the
      // implementation repositories above do. Holding an extract to this
      // repository's conventions asks it to be code it is not, and the twenty-
      // seven failures it raises are all of that kind - a static class, a name
      // this configuration restricts, globals a browser-shaped file assumes.
      'specs/*/annex/reference/',
    ],
  },
]
