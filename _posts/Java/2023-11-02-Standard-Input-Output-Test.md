---
title: "Java 표준 입출력 테스트"
categories:
  - Java
tags:
  - Test
  - 표준 입출력
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

표준 입력과 출력을 테스트하는 방법은 여러 가지가 있지만, 이 코드에서는 System.setIn(InputStream)과 System.setOut(PrintStream)을 이용하여 표준 입력과 출력을 변경한다.<br>

먼저 ByteArrayInputStream은 InputStream, ByteArrayOutputStream은 OutputStream 인터페이스를 구현한 클래스다.<br>

### ByteArrayInputStream
이 클래스는 내부적으로 바이트 배열을 유지하며, 이 배열에서 데이터를 읽을 수 있는 기능을 제공한다.<br>

ByteArrayInputStream의 주요 메서드
1. read(): 이 메서드는 스트림에서 다음 바이트를 읽어서 반환한다. 더 이상 읽을 바이트가 없는 경우 -1을 반환한다.
2. available(): 이 메서드는 스트림에서 읽을 수 있는 바이트 수를 반환한다. 이 메서드를 이용하면 read()를 호출하기 전에 읽을 수 있는 바이트가 있는지 확인할 수 있다.
3. reset(): 이 메서드는 스트림의 위치를 마지막으로 mark() 메서드가 호출된 위치로 되돌린다. mark() 메서드는 현재 위치를 표시하는데 사용되며, reset()을 호출하면 이 표시한 위치로 되돌아갑니다. ByteArrayInputStream에서는 생성자에서 자동으로 mark()가 호출되므로, reset()을 호출하면 스트림의 시작 위치로 돌아간다.
4. close(): 이 메서드는 입력 스트림을 닫는다. 스트림을 닫으면 더 이상 읽을 수 없게 되며, 사용하던 시스템 자원을 해제한다. 그러나 ByteArrayInputStream은 내부적으로 시스템 자원을 사용하지 않으므로, close() 메서드를 호출해도 실제로는 아무런 동작을 하지 않는다.


### ByteArrayOutputStream
이 클래스는 내부적으로 바이트 배열을 유지하며, 이 배열에 데이터를 쓸 수 있는 기능을 제공한다.<br>

ByteArrayOutputStream의 주요 메서드
1. write(int): 지정된 바이트를 출력 스트림에 쓴다.
2. write(byte[]): 지정된 바이트 배열의 모든 바이트를 출력 스트림에 쓴다.
3. write(byte[], int, int): 지정된 바이트 배열의 특정 부분을 출력 스트림에 쓴다.
4. toByteArray(): 출력 스트림에 쓰여진 모든 바이트를 바이트 배열로 반환한다.
5. toString(): 출력 스트림에 쓰여진 모든 바이트를 문자열로 변환하여 반환한다.

toString() 메서드를 이용하면 System.out.println() 등으로 출력된 내용을 문자열로 받아와서, 예상한 출력과 실제 출력이 일치하는지 테스트할 수 있다.

### 표준 입력출력 테스트
```java
public class RacingCarInputViewTest {

    private final ByteArrayOutputStream OUTPUT = new ByteArrayOutputStream();

    // 사용자가 Console에 입력한 문자열을 ByteArrayInputStream 타입으로 생성하여 
    // System.setIn() 메서드의 매개변수 타입인 InputStream 객체를 생성하여 원하는 입력 값을 넣어준다.
    public static InputStream generateUserInput(String input) {
        return new ByteArrayInputStream(input.getBytes()); 
    }

    @BeforeEach
    public void setup() {
        // System.setOut() 메서드는 PrintStream 타입을 매개변수로 받는다.
        // PrintStream을 생성할 때 InputStream타입을 받아서 생성한다.
        // 각 테스트 실행 전 System.setOut() 메서드를 이용하면 표준 출력 대상을 변경할 수 있는데, 
        // 이 코드의 경우 static으로 선언한 OUTPUT이라는 스트림으로 표준 출력이 리다이렉트된다.
        System.setOut(new PrintStream(OUTPUT));
    }

    @AfterEach
    public void restore() {
        // System.setIn(), System.setOut()은 입출력에 대한 전역 설정을 변경하기 때문에
        // 이후의 테스트에 영향을 미친다. 즉 의도한대로 테스트가 동작하지 않는다.
        // 그래서 각 테스트 종료 후 변경된 표준 입출력 설정을 원상복구 하기 위해 close()를 호출하여 초기화한다.
        // 이 코드에서는 Scanner를 내부적으로 구현한 Console이라는 라이브러리의 메서드를 사용했다.
        Console.close();
    }

    @DisplayName("자동차의 이름을 쉼표(,) 기준으로 입력받는다.")
    @ParameterizedTest
    @MethodSource("provideInputCarNamesTestArguments")
    public void inputCarNamesTest(String names, List<String> expected) {
        System.setIn(generateUserInput(names)); // System.setIn(InputStream)을 이용하여 테스트할 입력을 받는다.
        RacingCarInputView racingCarInputView = new RacingCarInputView();
        UserCarNameDto userCarNameDto = racingCarInputView.inputCarNames();
        List<String> carNames = userCarNameDto.carNames();
        for (int i = 0; i < carNames.size(); i++) {
            assertThat(carNames.get(i)).isEqualTo(expected.get(i));
        }
        // OUTPUT.toString() 메서드를 호출하여 
        // ByteArrayOutputStream 출력 스트림에 쓰여진 모든 바이트를 문자열로 변환하여 반환한다.
        // 즉 toString()으로 반환된 문자열과 출력되야할 문자열을 비교하여 테스트할 수 있다.
        assertThat(OUTPUT.toString()).isEqualTo("경주할 자동차 이름을 입력하세요.(이름은 쉼표(,) 기준으로 구분)\n");
    }

    @DisplayName("시도할 횟수를 입력받는다.")
    @ParameterizedTest
    @ValueSource(strings = {"0", "200000000"})
    void inputAttemptCountsTest(String attempt) {
        System.setIn(generateUserInput(attempt));
        RacingCarInputView racingCarInputView = new RacingCarInputView();
        UserAttemptCountsDto userAttemptCountsDto = racingCarInputView.inputAttemptCounts();
        assertThat(OUTPUT.toString()).isEqualTo("시도할 횟수는 몇회인가요?\n");
        assertThat(userAttemptCountsDto.attemptCounts()).isEqualTo(attempt);
    }

    // 테스트시 사용자에게 입력받을 메세지를 콘솔을 통해 직접 입력하지 않고
    // 콘솔에 입력될 문자열, 결과로 만들어질 문자열을 미리 지정하여 테스트한다.
    static Stream<Arguments> provideInputCarNamesTestArguments() {
        return Stream.of(
                arguments("java,jigi", List.of("java", "jigi")),
                arguments("java, wrong", List.of("java", " wrong")),
                arguments("java,,jigi", List.of("java", "", "jigi")),
                arguments("java#!@#$ ,jigi", List.of("java#!@#$ ", "jigi"))
        );
    }
}
```

위 코드는 표준 입력 테스트지만 사용자에게 입력을 받을 때 메세지 출력이 필요하므로 System.setOut() 메서드로 출력 메세지 또한 검증하고 있다.<br>
주의할 점은 System.setIn()과 System.setOut()은 전역 표준 입출력 설정을 변경하기 때문에 
InputStream과 OutputStream을 각 테스트 시작과 종료시 복구해주지 않으면
ByteArrayInputStream과 ByteArrayOutputStream이 변경된 상태이므로 여러 테스트가 독립적으로 수행하지 못해 실패하게 된다.
그래서 각 테스트 전에 해당 테스트의 출력값을 ByteArrayOutputStream으로 리다이렉트하여 테스트에서 출력되는 문자열이
ByteArrayOutputStream의 바이트에 쓰일 수 있게 한다.
또 테스트 내에서 테스트 로직에 사용될 입력값을 ByteArrayInputStream으로 생성하여 테스트에 쓰일 문자열을 저장한다.

흐름을 요약하자면
1. 출력되는 문자열을 OutputStream에 저장할 수 있게 System.setOut(PrintStream)을 사용해서 표준 입출력을 리다이렉트한다.
2. 각 테스트 종료 후 전역 설정이 변경된 OutputStream을 원상복구한다.
3. 테스트 내부에서 System.setIn(InputStream)을 사용해서 콘솔에 문자열을 입력한 것 처럼 InputStream에 사용될 문자열을 바이트로 저장한다.
4. 테스트 입력값과 출력값이 일치하는지 검증한다.
