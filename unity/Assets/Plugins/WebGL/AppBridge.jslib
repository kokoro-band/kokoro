mergeInto(LibraryManager.library, {
  KokoroDispatchToBrowser: function (eventNamePointer, payloadPointer) {
    const eventName = UTF8ToString(eventNamePointer);
    const payload = UTF8ToString(payloadPointer);

    window.dispatchEvent(
      new CustomEvent(eventName, {
        detail: payload,
      }),
    );
  },
});
