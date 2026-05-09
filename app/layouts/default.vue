<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <nav class="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
        <NuxtLink to="/" class="flex items-center gap-2 font-bold text-lg text-white hover:text-purple-400 transition-colors">
          <UIcon name="i-heroicons-shopping-bag" class="w-6 h-6 text-purple-400" />
          MerchTracker
        </NuxtLink>

        <div class="flex items-center gap-2">
          <UButton
            to="/"
            variant="ghost"
            icon="i-heroicons-home"
            color="gray"
            size="sm"
          >
            Events
          </UButton>
          <UButton
            to="/events/create"
            icon="i-heroicons-plus"
            color="purple"
            size="sm"
          >
            New Event
          </UButton>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 py-8">
      <slot />
    </main>
  </div>
</template>
