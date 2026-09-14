import java.util.*;
import kotlin.Unit;
import kotlin.coroutines.*;
import kotlin.coroutines.intrinsics.IntrinsicsKt;
import org.jacobrakaifoundation.beanstalk.data.WatchlistSyncEngine;
import org.jacobrakaifoundation.beanstalk.data.model.*;
import org.jacobrakaifoundation.beanstalk.ui.*;
public class AndroidRaceProbe {
  static boolean pending = true;
  static List<String> local = List.of("milk");
  static List<String> server = List.of();
  static int uploads = 0;
  static Continuation<? super Unit> inFlight;
  static Continuation<Boolean> done = new Continuation<>() {
    public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
    public void resumeWith(Object result) { System.out.println("first sync completed=" + result); }
  };
  static RecallNotice notice(String id) { return new RecallNotice(id,id,"summary",null,null,null,null,null,null,null,"2026-09-13",null,"2026-09-13T00:00:00Z","https://www.fda.gov/"+id); }
  public static void main(String[] args) {
    DeviceCredentials creds = new DeviceCredentials("device", "secret", "fid");
    WatchlistSyncEngine engine = new WatchlistSyncEngine(
      c -> pending,
      c -> local,
      c -> { pending = false; return Unit.INSTANCE; },
      () -> creds,
      c -> Unit.INSTANCE,
      (fid,c) -> { throw new AssertionError("unexpected registration"); },
      (c,terms,continuation) -> { uploads++; server=terms; inFlight=continuation; return IntrinsicsKt.getCOROUTINE_SUSPENDED(); }
    );
    Object started=engine.syncIfNeeded(done);
    if (started != IntrinsicsKt.getCOROUTINE_SUSPENDED()) throw new AssertionError("must suspend");
    local=List.of(); pending=true; // concurrent last-term removal while captured milk upload is in flight
    inFlight.resumeWith(Unit.INSTANCE);
    Object retry=engine.syncIfNeeded(done);
    System.out.println("last-term-removal: local="+local+" server="+server+" pending="+pending+" uploads="+uploads+" retry="+retry);
    if (!server.equals(List.of("milk")) || pending || uploads != 1) throw new AssertionError("bug not reproduced");
    NotificationDetailStateReducer reducer=NotificationDetailStateReducer.INSTANCE;
    BeanstalkUiState state=reducer.begin(new BeanstalkUiState()); // tap A
    state=reducer.begin(state); // tap B while A loads
    state=reducer.success(state,notice("B"),null,null,null); // B responds first
    state=reducer.success(state,notice("A"),null,null,null); // A response arrives late
    System.out.println("late-notification-response: lastTap=B displayed="+state.getSelectedNotice().getId()+" navigationVersion="+state.getNotificationNavigationVersion());
    if (!state.getSelectedNotice().getId().equals("A")) throw new AssertionError("bug not reproduced");
  }
}
