---
title: "JUnit 5 - @ParameterizedTest"
categories:
  - Java
tags:
  - JUnit 5
  - ParameterizedTest
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

## @ParameterizedTest

**`@ParameterizedTest`** 어노테이션은 매개변수화된 테스트를 정의하는 데 사용한다. 이 어노테이션을 사용하면 동일한 테스트 메소드를 여러 다른 입력 값으로 여러 번 실행할 수 있다.

---

## @ParameterizedTest와 함께 사용하는 어노테이션

**`@ParameterizedTest`** 어노테이션과 관련된 어노테이션들을 사용하여 여러 다양한 입력 값에 대한 테스트를 작성하고 코드 중복을 최소화할 수 있다.

### 1. @ValueSource

**`@ValueSource`** 어노테이션은 기본 타입과 문자열 값을 사용하여 매개변수화된 테스트를 정의하는 데 사용한다. 이 어노테이션을 사용하면 테스트 메소드를 단일 값을 나열한 배열로 실행할 수 있다.

```java
@ParameterizedTest
@ValueSource(ints = {1, 2, 3, 4, 5}) // static final 키워드를 붙여줄 필요 없이 사용 가능.
void testWithIntValues(int value) {
    // 테스트 로직
}
```

### 2. @EnumSource

`@EnumSource` 어노테이션은 열거형(`enum`) 상수를 사용하여 매개변수화된 테스트를 정의하는데 사용한다. 이 어노테이션을 사용하면 특정 열거형 클래스의 상수를 테스트 메서드로 전달할 수 있다.

```java
// Enum 클래스는 기본적으로 static이므로 따로 static 키워드를 쓸 필요가 없다.
enum Days {
    MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY
}

public class EnumExample {
    @ParameterizedTest
    @EnumSource(Days.class)
    void testEnumValues(Days day) {
        // 테스트 코드
    }
}
```

### 3. @MethodSource

`@MethodSource` 어노테이션은 매개변수화된 테스트에 필요한 매개변수를 생성하는 메서드를 지정할 수 있다. 이 메서드는 반드시 `Stream` 또는 `Iterable`을 반환해야 한다.

```java
@ParameterizedTest
@MethodSource("methodName")
void testWithMethodSource(int value) {
    // 테스트 로직
}

// @MethodSource로 지정한 메서드는 static이어야 하고,
// Stream, Iterable, Iterator, Arguments, 또는 배열과 같은 인자를 생성하여 반환해야한다.
static Stream<Arguments> methodName() {
    return Stream.of(
        Arguments.of(1),
        Arguments.of(2),
        // ...
    );
}
```

### 4. @CsvSource, @CsvFileSource

**`@CsvSource`** 어노테이션은 CSV 형식의 데이터로 매개변수화된 테스트를 정의하는 데 사용된다. **`@CsvFileSource`**는 CSV 파일에서 데이터를 읽어와 매개변수로 사용할 수 있다.

```java
@ParameterizedTest
@CsvSource({"John, Doe", "Alice, Smith"}) // CSV 형식의 데이터.
void testWithCsvSource(String firstName, String lastName) {
    // 테스트 로직
}

@ParameterizedTest
@CsvFileSource(resources = "/test-data.csv") // CSV 파일의 경로를 지정.
void testWithCsvFileSource(String value) {
    // 테스트 로직
}
```

### 5. @NullSource, @EmptySource

**`@NullSource`** 어노테이션은 **`null`** 값을 사용하여 매개변수화된 테스트를 정의하는 데 사용한다. **`@EmptySource`**는 빈 값(예: 빈 문자열)을 사용할 때 유용하다.

```java
@ParameterizedTest
@NullSource // null값
void testWithNullValue(String value) {
    // 테스트 로직
}

@ParameterizedTest
@EmptySource // 빈 문자열
void testWithEmptyValue(String value) {
    // 테스트 로직
}
```

---

## @ParameterizedTest에 함께 사용하는 인자들이 왜 static이어야 하는지?

JUnit 5를 사용하여 테스트코드를 작성하는 도중 실패 케이스에 대한 여러 파라미터를 넣고 싶어서 @ParameterizedTest와 @MethodSource를 사용했다.

```java
@DisplayName("페이지 입력값이 2개가 아니면 에러가 발생한다.")
@ParameterizedTest
@MethodSource("provideWrongPageSizeTestArguments")
void validatePagesTest2(List<Integer> pages) {
    PagesValidator pagesValidator = new PagesValidator();
    assertThatCode(() -> pagesValidator.validate(pages))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessage("페이지는 정확히 2페이지만 입력 가능합니다.");
}

static Stream<Arguments> provideWrongPageSizeTestArguments() {
    return Stream.of(
            Arguments.of(List.of(97)),
            Arguments.of(List.of(97, 98, 99))
    );
}
```

`@MethodSource`에 넣어줄 메서드를 작성하고 있었는데, `provideWrongPageSizeTestArguments()` 메서드가 `static`이 아니면 에러가 나는 것 때문에 왜 `static` 메서드만 가능한지 의문이 들었다.

JUnit 5에서 `@ParameterizedTest`를 사용할 때 `@MethodSource`로 지정한 메서드는 테스트 메서드가 실행되기 전에 호출되어 인자를 생성하거나 제공하는 역할을 하는데, 해당 메서드가 `static`메서드가 아니면 JUnit이 `@MethodSource`로 지정한 메서드를 찾을 수 없다는 것이다.

별거 아니지만 JUnit이 `@ParameterizedTest`를 실행할 때 테스트를 동적으로 생성하고 호출하는 과정에 매개변수로 넣어줄 메서드나 인자들이 `static`으로 존재해야 인스턴스 생성 없이 테스트를 구성할 수 있기 때문이라는 것을 알게되었다.
