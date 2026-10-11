type Listener<T> = (data: T) => void;

class SimpleEventEmitter {
  private events: Record<string, Set<Listener<any>>> = {};

  on<T>(event: string, listener: Listener<T>): () => void {
    if (!this.events[event]) {
      this.events[event] = new Set();
    }
    this.events[event].add(listener);
    return () => this.off(event, listener);
  }

  off<T>(event: string, listener: Listener<T>): void {
    if (!this.events[event]) return;
    this.events[event].delete(listener);
  }

  emit<T>(event: string, data: T): void {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => {
      try {
        listener(data);
      } catch (err) {
        console.error(`Error in event listener for ${event}:`, err);
      }
    });
  }
}

export const eventBus = new SimpleEventEmitter();
