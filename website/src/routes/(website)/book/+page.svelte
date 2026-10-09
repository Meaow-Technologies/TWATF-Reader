<script lang="ts">
  import imgOriginal from "$lib/assets/web-cover-original.jpg?enhanced&w=9999";
  import imgRevised from "$lib/assets/web-cover-revised.jpg?enhanced&w=9999";
  import { BOOKS } from "$lib/site";

  const cards = [
    { ...BOOKS.original, cover: imgOriginal },
    { ...BOOKS.revised, cover: imgRevised },
  ];
</script>

<main
  class="min-h-dvh flex flex-col items-center justify-center gap-10 p-8 md:flex-row md:justify-evenly"
>
  {#each cards as card}
    <div class="flex flex-col items-center gap-4">
      <a
        class="hover-3d static"
        href="/book/{card.id}"
        data-sveltekit-preload-data
      >
        <figure class="md:w-80 w-60 rounded-2xl cursor-pointer">
          <enhanced:img
            src={card.cover}
            alt="{card.title} cover"
            fetchpriority="high"
          />
        </figure>
        <!-- 8 empty divs needed for the 3D effect -->
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </a>
      <p class="text-xl font-bold drop-shadow-lg">{card.title}</p>
    </div>
  {/each}
</main>
