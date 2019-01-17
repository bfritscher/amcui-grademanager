module.exports = {
  locales: {
    "/": {
      lang: "fr-CH",
      title: "AMCUI",
      description: "Guide d'utilisateur de AMCUI."
    }
  },
  base: "/docs/",
  ga: "UA-55173430-7",
  themeConfig: {
    // if your docs are in a different repo from your main project:
    docsRepo: "bfritscher/grademanager",
    // if your docs are in a specific branch (defaults to 'master'):
    docsBranch: "docs",
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
  }
};
