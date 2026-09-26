import { installRemoteCutLoader } from '../puzzle/cutters/biomorphic/bakedCutSource';
import { bakedCutOnDisk } from '../puzzle/cutters/biomorphic/bakedCutOnDisk';

// Tests read remote cuts from the checkout, where every payload also lives,
// so the full catalog can be exercised without a network.
installRemoteCutLoader(async (remote) => bakedCutOnDisk({ remote }));
