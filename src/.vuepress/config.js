const { description } = require('../../package')

module.exports = {
  locales: {
    "/": {
      lang: "fr-CH",
      title: "AMCUI",
      description: "Guide d'utilisateur de AMCUI."
    }
  },
  /**
   * Ref：https://v1.vuepress.vuejs.org/config/#title
   */
  title: 'Vuepress Docs Boilerplate',
  /**
   * Ref：https://v1.vuepress.vuejs.org/config/#description
   */
  description: description,

  /**
   * Extra tags to be injected to the page HTML `<head>`
   *
   * ref：https://v1.vuepress.vuejs.org/config/#head
   */
  head: [
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
    ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
    ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }]
  ],

  /**
   * Theme configuration, here is the default theme configuration for VuePress.
   *
   * ref：https://v1.vuepress.vuejs.org/theme/default-theme-config.html
   */
   base: "/amcui-grademanager/",
   themeConfig: {
    // if your docs are in a different repo from your main project:
    repo: "bfritscher/amcui-grademanager",
    // if your docs are in a specific branch (defaults to 'master'):
    docsBranch: "docs",
    docsDir: "src",
    // defaults to false, set to true to enable
    editLinks: true,
    // custom text for edit link. Defaults to "Edit this page"
    editLinkText: "Aidez-nous à améliorer cette page!",
    nav: [
      {
        text: "GUIDE",
        link: "/main"
      },
      {
        text: "AMCUI",
        link: "https://amcui.ig.he-arc.ch"
      }
    ],
    sidebar: ["main", "edit", "scan", "grade", "advanced"]
  },

  /**
   * Apply plugins，ref：https://v1.vuepress.vuejs.org/zh/plugin/
   */
  plugins: [
    '@vuepress/plugin-back-to-top',
    '@vuepress/plugin-medium-zoom',
    '@vuepress/google-analytics', {
      ga: 'UA-55173430-7'
    }
  ]
}
