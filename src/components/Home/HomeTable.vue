<template>
  <q-markup-table>
    <thead>
      <tr>
        <th class="text-left">Name</th>
        <th class="text-left">Status</th>
        <th class="text-left">Collaborators</th>
        <th class="text-right"><span class="q-mr-lg">Action</span></th>
      </tr>
    </thead>
    <tbody>
      <template v-for="(item, index) in items" :key="index">
        <tr
          v-if="group && item[group] !== items[index - 1]?.[group]"
          class="subheader bg-primary text-white text-uppercase"
        >
          <td colspan="4" class="text-bold">{{ item[group] }}</td>
        </tr>
        <tr class="project cursor-pointer" @click="$emit('openProject', item)">
          <td>
            <b>{{ item.project }}</b>
          </td>
          <td>
            <span v-if="item.status?.printed && !item.status?.annotated"
              >printed</span
            >
            <span v-if="item.status?.annotated">annotated</span>
          </td>
          <td>{{ item.users.join(', ') }}</td>
          <td class="text-right">
            <q-btn
              title="open"
              aria-label="open project"
              color="primary"
              icon="mdi-eye"
              flat
            ></q-btn>
            <q-btn
              title="copy"
              aria-label="copy project"
              color="primary"
              icon="mdi-content-copy"
              flat
              @click.stop.prevent="$emit('copyProject', item)"
            ></q-btn>
          </td>
        </tr>
      </template>
    </tbody>
  </q-markup-table>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';
import { Project } from '../models';

export default defineComponent({
  name: 'HomeTable',
  props: {
    items: {
      type: Array as PropType<Project[]>,
      required: true,
    },
    group: {
      type: String as PropType<keyof Project>,
      default: '',
    },
  },
  emits: ['openProject', 'copyProject'],
});
</script>
