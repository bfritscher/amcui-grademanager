<script setup lang="ts">
import { LexicalTreeViewPlugin } from 'lexical-vue';
</script>

<template>
  <LexicalTreeViewPlugin
    view-class-name="tree-view-output"
    tree-type-button-class-name="debug-treetype-button"
    time-travel-panel-class-name="debug-timetravel-panel"
    time-travel-button-class-name="debug-timetravel-button"
    time-travel-panel-slider-class-name="debug-timetravel-panel-slider"
    time-travel-panel-button-class-name="debug-timetravel-panel-button"
  />
</template>
<style>
.tree-view-output {
  display: block;
  background: #222;
  color: #fff;
  padding: 0;
  font-size: 12px;
  margin: 1px auto 10px auto;
  position: relative;
  overflow: hidden;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
}

.tree-view-output pre {
  line-height: 1.1;
  background: #222;
  color: #fff;
  margin: 0;
  padding: 10px;
  font-size: 12px;
  overflow: auto;
  max-height: 400px;
}

.tree-view-output pre::-webkit-scrollbar {
  background: transparent;
  width: 10px;
}

.tree-view-output pre::-webkit-scrollbar-thumb {
  background: #999;
}

.debug-timetravel-panel {
  overflow: hidden;
  padding: 0 0 10px 0;
  margin: auto;
  display: flex;
}

.debug-timetravel-panel-slider {
  padding: 0;
  flex: 8;
}

.debug-timetravel-panel-button {
  padding: 0;
  border: 0;
  background: none;
  flex: 1;
  color: #fff;
  font-size: 12px;
}

.debug-timetravel-panel-button:hover {
  text-decoration: underline;
}

.debug-timetravel-button {
  border: 0;
  padding: 0;
  font-size: 12px;
  top: 10px;
  right: 15px;
  position: absolute;
  background: none;
  color: #fff;
}

.debug-timetravel-button:hover {
  text-decoration: underline;
}

.debug-treetype-button {
  border: 0;
  padding: 0;
  font-size: 12px;
  top: 10px;
  right: 85px;
  position: absolute;
  background: none;
  color: #fff;
}

.debug-treetype-button:hover {
  text-decoration: underline;
}
</style>
