<template>
  <router-view />
</template>
<script lang="ts">
import { defineComponent } from 'vue';

import 'codemirror/mode/stex/stex.js';
import 'codemirror/mode/xml/xml.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/addon/fold/xml-fold.js';
import 'codemirror/addon/edit/matchbrackets.js';
import 'codemirror/addon/edit/closebrackets.js';
import 'codemirror/addon/edit/matchtags.js';
import 'codemirror/addon/edit/closetag.js';

export default defineComponent({
  name: 'App',
});
</script>
