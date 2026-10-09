<script lang="ts">
  import Icon from "@iconify/svelte";
  import { SITE } from "$lib/site";
</script>

<main class="flex min-h-dvh flex-col items-center px-4 pt-10 pb-6 text-center">
  <!-- Title, description and the two main buttons, centered on the screen -->
  <div
    class="flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6"
  >
    <h1
      class="w-full text-3xl font-bold text-primary drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] md:text-5xl"
    >
      {SITE.name}
    </h1>

    <div class="space-y-2 text-sm leading-relaxed brightness-95 md:text-lg">
      {#each SITE.description as line}
        <p>{line}</p>
      {/each}
    </div>

    <div class="flex gap-4 pt-2">
      <a
        class="btn btn-lg btn-soft btn-primary"
        href="/book"
        data-sveltekit-preload-data>Read</a
      >
      <a class="btn btn-lg btn-soft btn-secondary" href="/download">Download</a>
    </div>
  </div>

  <!-- Four buttons at the bottom center -->
  <nav class="flex flex-wrap justify-center gap-3 pt-8">
    <a href="/donate" class="btn btn-soft btn-secondary">
      <Icon icon="mdi:heart-outline" class="size-5" /> Donate
    </a>
    <a
      href="https://github.com/{SITE.repo}"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-soft btn-info"
    >
      <Icon icon="mdi:information-outline" class="size-5" /> Info
    </a>
    <a
      href="https://github.com/{SITE.repo}/blob/main/contributing.md"
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-soft btn-warning"
    >
      <Icon icon="ri:edit-line" class="size-5" /> Contribute
    </a>
    <a
      href={SITE.discord}
      target="_blank"
      rel="noopener noreferrer"
      class="btn btn-soft btn-accent"
    >
      <Icon icon="mingcute:discord-line" class="size-5" /> Discord
    </a>
  </nav>
</main>
