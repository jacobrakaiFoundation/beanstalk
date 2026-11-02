from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent
repo = Path('/Users/jacobrakai/Projects/beanstalk-android-release')
cache = Path('/Users/jacobrakai/.gradle/caches/modules-2/files-2.1')
classes = repo / 'android/app/build/tmp/kotlin-classes/debug'
jdk = Path('/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin')
libs = []
for artifact in ['org.jetbrains.kotlin/kotlin-stdlib/2.3.20', 'org.jetbrains.kotlinx/kotlinx-serialization-core-jvm/1.11.0', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.11.0']:
    jars = list((cache / artifact).glob('*/*.jar'))
    if not jars:
        raise SystemExit('Missing dependency in Gradle cache: ' + artifact)
    libs.extend(jars)
classpath = ':'.join(map(str, [classes, *libs]))
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
print('Repository HEAD=' + head)
with tempfile.TemporaryDirectory(prefix='beanstalk-android-race-') as compiled:
    subprocess.run([str(jdk / 'javac'), '-cp', classpath, '-d', compiled, str(root / 'AndroidRaceProbe.java')], check=True)
    result = subprocess.run([str(jdk / 'java'), '-cp', compiled + ':' + classpath, 'AndroidRaceProbe'], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, end='')
    (root / 'probe-output.txt').write_text('Repository HEAD=' + head + '\n' + result.stdout)
