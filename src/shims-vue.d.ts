// Mocks all files ending in `.vue` showing them as plain Vue instances
declare module '*.vue' {
  import { ComponentOptions } from 'vue';
  const component: ComponentOptions;
  export default component;
}

declare module 'diffsync' {
  export let Client: {
    new (io: any, project: string): any;
  };
}

declare module 'codemirror-editor-vue3';
declare module 'wysihtml5';
declare module 'JSONsearch';