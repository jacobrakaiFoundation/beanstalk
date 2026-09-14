from pathlib import Path
import subprocess
import os
import shutil
import tempfile

root = Path(__file__).resolve().parent
repo = root.parents[3]
cache = Path(os.environ.get('GRADLE_USER_HOME', str(Path.home() / '.gradle'))) / 'caches/modules-2/files-2.1'
classes = repo / 'android/app/build/tmp/kotlin-classes/debug'
jdk = Path(os.environ['JAVA_HOME']) / 'bin' if os.environ.get('JAVA_HOME') else None
javac = str(jdk / 'javac') if jdk else shutil.which('javac')
java = str(jdk / 'java') if jdk else shutil.which('java')
if not javac or not java:
    raise SystemExit('JDK required: set JAVA_HOME or add java and javac to PATH')
libs = []
for artifact in ['org.jetbrains.kotlin/kotlin-stdlib/2.3.20', 'org.jetbrains.kotlinx/kotlinx-serialization-core-jvm/1.11.0', 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.11.0']:
    jars = list((cache / artifact).glob('*/*.jar'))
    if not jars:
        raise SystemExit('Missing dependency in Gradle cache: ' + artifact)
    libs.extend(jars)
classpath = os.pathsep.join(map(str, [classes, *libs]))
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
print('Repository HEAD=' + head)
with tempfile.TemporaryDirectory(prefix='beanstalk-android-race-') as compiled:
    subprocess.run([javac, '-cp', classpath, '-d', compiled, str(root / 'AndroidRaceProbe.java')], check=True)
    result = subprocess.run([java, '-cp', compiled + os.pathsep + classpath, 'AndroidRaceProbe'], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, end='')
