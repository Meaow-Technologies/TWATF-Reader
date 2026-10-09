<script lang="ts">
  import imgBG from "$lib/assets/web-bg.jpg?enhanced";
  import imgHome from "$lib/assets/web-home-bg.jpg?enhanced";
  import Icon from "@iconify/svelte";
  import "../../app.css";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import imgMeta from "$lib/assets/web-home-bg.jpg?url";
  import { SITE } from "$lib/site";

  let { children } = $props();

  let isHomePage = $derived(page.url.pathname === "/");

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      goto("../");
    } else {
      goto("/");
    }
  }
  $effect(() => {
    const _ = page.url.href;
    document.documentElement.setAttribute("data-theme", "sunset");
  });
</script>

<svelte:head>
  <title>{SITE.name}</title>
  <meta name="description" content={SITE.metaDescription} />

  <meta property="og:type" content="website" />
  <meta property="og:title" content={SITE.name} />
  <meta property="og:description" content={SITE.metaDescription} />
  <meta property="og:image" content="{SITE.url}{imgMeta}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={SITE.name} />
  <meta name="twitter:description" content={SITE.metaDescription} />
  <meta name="twitter:image" content="{SITE.url}{imgMeta}" />
</svelte:head>

<!-- Home page and the other pages use different background images. -->
<div class="fixed inset-0 -z-10 overflow-hidden">
  {#if isHomePage}
    <enhanced:img src={imgHome} alt="" class="w-full h-full object-cover" />
  {:else}
    <enhanced:img src={imgBG} alt="" class="w-full h-full object-cover" />
  {/if}

  <div class="absolute inset-0 bg-black/40 backdrop-blur-xs"></div>
</div>

{#if !isHomePage}
  <div class="fixed top-4 left-4 z-50">
    <button
      onclick={handleBack}
      class="btn btn-circle btn-ghost bg-base-300/50 backdrop-blur-md hover:bg-base-300 transition-all shadow-lg"
      aria-label="Go back"
    >
      <Icon icon="material-symbols:arrow-back-rounded" class="size-6" />
    </button>
  </div>
{/if}


{@render children()}
